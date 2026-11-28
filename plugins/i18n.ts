/* oxlint-disable no-unsafe-assignment, no-unnecessary-condition, no-non-null-assertion, no-map-spread, no-nested-ternary, max-params, prefer-at, no-continue, max-depth, prefer-named-capture-group, curly, no-array-callback-reference -- Build-time generator with validated lookups. */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { AstroIntegration } from "astro";
import { parseSync } from "oxc-parser";

export interface I18nOptions {
  locales: readonly string[];
  defaultLocale: string;
  localeNames: Record<string, string>;
  /** Directory holding `{locale}.json` files. */
  translationsDir: string;
  /** Island sources live under `sourceDir`; generated modules are written to `outDir`. */
  client: { sourceDir: string; outDir: string };
  /** One module per `*ApiMessages` namespace. */
  server: { outDir: string };
}

// ---------------------------------------------------------------------------
// JSON loading and validation
// ---------------------------------------------------------------------------

type JsonObject = Record<string, unknown>;

const LABELS_ROOT = "labels";
const SERVER_NAMESPACE_SUFFIX = "ApiMessages";

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function leafKind(value: unknown): "string" | "array" | "object" | "invalid" {
  if (typeof value === "string") {
    return "string";
  }
  if (Array.isArray(value)) {
    return value.every((item) => typeof item === "string") ? "array" : "invalid";
  }
  if (isRecord(value)) {
    return "object";
  }
  return "invalid";
}

function assertValueTree(value: unknown, where: string): void {
  const kind = leafKind(value);
  if (kind === "invalid") {
    throw new Error(`i18n: invalid value at "${where}" (expected string, string[] or object)`);
  }
  if (kind !== "object") {
    return;
  }
  for (const [key, child] of Object.entries(value as JsonObject)) {
    assertValueTree(child, `${where}.${key}`);
  }
}

/** Assert that `value` has exactly the structure and leaf shapes of `reference`. */
function assertSameShape(reference: unknown, value: unknown, where: string): void {
  const expected = leafKind(reference);
  const actual = leafKind(value);

  if (expected === "invalid") {
    throw new Error(`i18n: default locale has an invalid value at "${where}"`);
  }
  if (actual === "invalid") {
    throw new Error(`i18n: invalid value at "${where}" (expected string, string[] or object)`);
  }
  if (expected !== actual) {
    throw new Error(
      `i18n: value shape mismatch at "${where}" (${expected} in default locale, ${actual} here)`,
    );
  }
  if (expected !== "object") {
    return;
  }

  const referenceObject = reference as JsonObject;
  const valueObject = value as JsonObject;

  for (const key of Object.keys(referenceObject)) {
    if (!(key in valueObject)) {
      throw new Error(`i18n: missing key "${where}.${key}"`);
    }
    assertSameShape(referenceObject[key], valueObject[key], `${where}.${key}`);
  }
  for (const key of Object.keys(valueObject)) {
    if (!(key in referenceObject)) {
      throw new Error(`i18n: unexpected key "${where}.${key}" (absent from default locale)`);
    }
  }
}

function loadMessages(options: I18nOptions): Record<string, JsonObject> {
  if (!options.locales.includes(options.defaultLocale)) {
    throw new Error(
      `i18n: defaultLocale "${options.defaultLocale}" is not in locales (${options.locales.join(", ")})`,
    );
  }

  const root = path.resolve(options.translationsDir);
  const messages: Record<string, JsonObject> = {};

  for (const locale of options.locales) {
    const file = path.join(root, `${locale}.json`);
    if (!existsSync(file)) {
      throw new Error(`i18n: missing translation file ${file}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
      throw new Error(`i18n: invalid JSON in ${file}`, { cause: error });
    }
    if (!isRecord(parsed)) {
      throw new Error(`i18n: ${file} must contain a JSON object of namespaces`);
    }

    for (const [namespace, content] of Object.entries(parsed)) {
      if (leafKind(content) !== "object") {
        throw new Error(`i18n: namespace "${namespace}" in ${file} must be an object`);
      }
      assertValueTree(content, namespace);
    }
    messages[locale] = parsed;
  }

  const reference = messages[options.defaultLocale]!;
  for (const locale of options.locales) {
    if (locale === options.defaultLocale) {
      continue;
    }
    assertSameShape(reference, messages[locale], "translations");
  }

  return messages;
}

function leafPaths(object: JsonObject, prefix: string): string[] {
  const result: string[] = [];
  for (const [key, value] of Object.entries(object)) {
    const current = prefix.length === 0 ? key : `${prefix}.${key}`;
    if (isRecord(value)) {
      result.push(...leafPaths(value, current));
    } else {
      result.push(current);
    }
  }
  return result;
}

function valueAt(messages: JsonObject, dottedPath: string): unknown {
  let current: unknown = messages;
  for (const segment of dottedPath.split(".")) {
    if (!isRecord(current) || !(segment in current)) {
      throw new Error(`i18n: unknown label path "${dottedPath}"`);
    }
    current = current[segment];
  }
  return current;
}

const JS_MEMBERS: ReadonlySet<string> = new Set([
  "length",
  ...Object.getOwnPropertyNames(String.prototype),
  ...Object.getOwnPropertyNames(Array.prototype),
  ...Object.getOwnPropertyNames(Object.prototype),
]);

// ---------------------------------------------------------------------------
// Source tracking (oxc)
// ---------------------------------------------------------------------------

type AstNode = Record<string, unknown> & { type?: string };

interface AnalyzeContext {
  /** Identifiers that hold a labels object. */
  aliases: Set<string>;
  /** Identifiers bound to a namespace (or deeper node) of the labels object. */
  namespaceRoots: Map<string, string[]>;
  /** Parameters whose object type contains a labels property. */
  labelsParams: Set<string>;
  /** String values of local `const` maps, for computed-key resolution. */
  constants: Map<string, string[]>;
}

interface FileUsage {
  ids: Set<string>;
  imports: string[];
  /** Full dotted label paths read in this file. */
  reads: Set<string>;
  /** True when an unresolvable dynamic read forces all client namespaces. */
  full: boolean;
}

function walk(
  value: unknown,
  visit: (node: AstNode, parent: AstNode | null) => void,
  parent: AstNode | null = null,
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      walk(item, visit, parent);
    }
    return;
  }
  if (typeof value !== "object" || value === null) {
    return;
  }

  const node = value as AstNode;
  if (typeof node.type === "string") {
    visit(node, parent);
  }
  for (const [key, child] of Object.entries(node)) {
    if (key === "type" || key === "start" || key === "end") {
      continue;
    }
    walk(child, visit, typeof node.type === "string" ? node : parent);
  }
}

function nameOf(node: unknown): string | null {
  if (typeof node !== "object" || node === null) {
    return null;
  }
  const value = node as AstNode;
  return typeof value.name === "string" ? value.name : null;
}

function unwrap(node: unknown): AstNode | undefined {
  if (typeof node !== "object" || node === null) {
    return undefined;
  }
  const value = node as AstNode;
  if (
    value.type === "TSAsExpression" ||
    value.type === "TSSatisfiesExpression" ||
    value.type === "TSNonNullExpression" ||
    value.type === "ParenthesizedExpression"
  ) {
    return unwrap(value.expression);
  }
  return value;
}

function constValues(node: unknown): string[] {
  if (Array.isArray(node)) {
    return node.flatMap((item) => constValues(item));
  }
  if (typeof node !== "object" || node === null) {
    return [];
  }
  const value = node as AstNode;
  if (value.type === "Literal" && typeof value.value === "string") {
    return [value.value];
  }
  if (value.type === "ObjectExpression") {
    return Array.isArray(value.properties)
      ? value.properties.flatMap((property) => constValues((property as AstNode).value))
      : [];
  }
  if (value.type === "ArrayExpression") {
    return Array.isArray(value.elements)
      ? value.elements.flatMap((element) => constValues(element))
      : [];
  }
  return [];
}

/** Matches `<anything>.labels` (including computed `["labels"]`). */
function isLabelsMember(node: AstNode): boolean {
  if (node.type !== "MemberExpression") {
    return false;
  }
  if (node.computed === true) {
    const property = unwrap(node.property);
    return property?.type === "Literal" && property.value === LABELS_ROOT;
  }
  return nameOf(node.property) === LABELS_ROOT;
}

function propertySegments(
  property: unknown,
  computed: boolean | undefined,
  context: AnalyzeContext,
): { values: string[]; dynamic: boolean } {
  if (computed !== true) {
    const name = nameOf(property);
    return name === null ? { values: [], dynamic: true } : { values: [name], dynamic: false };
  }

  const prop = unwrap(property);
  if (prop?.type === "Literal" && typeof prop.value === "string") {
    return { values: [prop.value], dynamic: false };
  }

  // `labels[KEYS.foo]` / `labels[key]` — resolve from local const maps.
  const root = prop?.type === "MemberExpression" ? nameOf(prop.object) : nameOf(prop);
  const resolved = root === null ? undefined : context.constants.get(root);
  return resolved === undefined || resolved.length === 0
    ? { values: [], dynamic: true }
    : { values: resolved, dynamic: false };
}

interface LabelPath {
  /** Alternative paths (segment arrays) after the labels root. */
  paths: string[][];
  dynamic: boolean;
}

/** Resolve a member-expression chain to its path(s) *after* the labels root. */
function labelPath(node: AstNode, context: AnalyzeContext): LabelPath | null {
  if (node.type === "Identifier") {
    const name = nameOf(node);
    if (name === null) {
      return null;
    }
    if (context.aliases.has(name)) {
      return { paths: [[]], dynamic: false };
    }
    const namespace = context.namespaceRoots.get(name);
    return namespace === undefined ? null : { paths: [[...namespace]], dynamic: false };
  }
  if (node.type !== "MemberExpression") {
    return null;
  }
  if (isLabelsMember(node)) {
    return { paths: [[]], dynamic: false };
  }
  const objectName = nameOf(node.object);
  if (
    objectName !== null &&
    context.labelsParams.has(objectName) &&
    nameOf(node.property) === LABELS_ROOT
  ) {
    return { paths: [[]], dynamic: false };
  }

  const base = labelPath(node.object as AstNode, context);
  if (base === null) {
    return null;
  }
  const property = propertySegments(node.property, node.computed as boolean | undefined, context);
  if (property.dynamic) {
    return { paths: base.paths, dynamic: true };
  }
  return {
    paths: base.paths.flatMap((segments) => property.values.map((value) => [...segments, value])),
    dynamic: base.dynamic,
  };
}

function isLabelExpression(node: unknown, context: AnalyzeContext): boolean {
  const value = unwrap(node);
  if (value === undefined) {
    return false;
  }
  if (isLabelsMember(value)) {
    return true;
  }
  const name = nameOf(value);
  return name !== null && (context.aliases.has(name) || context.namespaceRoots.has(name));
}

function paramIdentifier(param: unknown): string | null {
  const value = unwrap(param);
  if (value === undefined) {
    return null;
  }
  return nameOf(value) ?? nameOf(value.id) ?? nameOf(value.parameter) ?? nameOf(value.left) ?? null;
}

function collectParamAliases(node: AstNode, context: AnalyzeContext): void {
  if (
    node.type !== "FunctionDeclaration" &&
    node.type !== "FunctionExpression" &&
    node.type !== "ArrowFunctionExpression"
  ) {
    return;
  }
  for (const rawParam of Array.isArray(node.params) ? node.params : []) {
    const param = unwrap(rawParam);

    if (param === undefined) {
      continue;
    }

    let typedAsLabels = false;
    walk(param, (candidate) => {
      if (candidate.type !== "TSTypeReference") {
        return;
      }
      const typeName = nameOf(candidate.typeName) ?? nameOf((candidate.typeName as AstNode)?.right);
      if (typeName === "Labels" || typeName?.endsWith("Labels") === true) {
        typedAsLabels = true;
      }
    });
    const name = typedAsLabels ? paramIdentifier(param) : null;
    if (name !== null) {
      const annotation = unwrap(param.typeAnnotation);
      const inner = unwrap(annotation?.typeAnnotation);

      if (annotation?.type === "TSTypeAnnotation" && inner?.type === "TSTypeReference") {
        context.aliases.add(name);
      } else {
        context.labelsParams.add(name);
      }
    }
  }
}

function collectDestructuredRoots(
  id: unknown,
  init: AstNode | undefined,
  context: AnalyzeContext,
): void {
  if (typeof id !== "object" || id === null || (id as AstNode).type !== "ObjectPattern") {
    return;
  }
  if (init === undefined) {
    return;
  }

  const base: LabelPath | null = isLabelsMember(init)
    ? { paths: [[]], dynamic: false }
    : labelPath(init, context);

  if (base === null || base.dynamic || base.paths.length !== 1) {
    return;
  }
  const segments = base.paths[0]!;
  const fromLabelsRoot = segments.length === 0;

  for (const property of Array.isArray((id as AstNode).properties)
    ? ((id as AstNode).properties as unknown[])
    : []) {
    const prop = property as AstNode;
    if (prop?.type !== "Property") {
      continue;
    }
    const keyNode = unwrap(prop.key);
    const key =
      prop.computed === true
        ? keyNode?.type === "Literal" && typeof keyNode.value === "string"
          ? keyNode.value
          : null
        : nameOf(prop.key);
    const local = nameOf(prop.value);
    // Only the labels property of a mixed options object is a label root;
    // mapping every destructured field produces bogus label paths.
    if (key !== null && local !== null && (fromLabelsRoot || key === LABELS_ROOT)) {
      context.namespaceRoots.set(local, [...segments, key]);
    }
  }
}

function analyze(sourceText: string, filename: string): FileUsage {
  const parsed = parseSync(filename, sourceText, { lang: "tsx", sourceType: "module" });
  if (parsed.errors.length > 0) {
    throw new Error(
      `i18n: failed to parse ${filename}: ${parsed.errors[0]?.message ?? "unknown error"}`,
    );
  }

  const ids = new Set<string>();
  const imports: string[] = [];
  const reads = new Set<string>();
  let full = false;
  const context: AnalyzeContext = {
    aliases: new Set([LABELS_ROOT]),
    namespaceRoots: new Map(),
    labelsParams: new Set(),
    constants: new Map(),
  };
  const normalized = filename.split(path.sep).join("/");
  const isIsland = normalized.includes("/ui/") && filename.endsWith(".tsx");

  // Pass 1 — build the alias/constant maps before reading any member expressions.
  walk(parsed.program, (node) => {
    if (isIsland && node.type === "ExportDefaultDeclaration") {
      const declaration = node.declaration;
      if (typeof declaration === "object" && declaration !== null) {
        const value = declaration as AstNode;
        const name =
          value.type === "FunctionDeclaration" || value.type === "ClassDeclaration"
            ? nameOf(value.id)
            : nameOf(value);
        if (name !== null) {
          ids.add(name);
        }
      }
    }

    if (node.type === "ImportDeclaration") {
      const source = (node.source as AstNode | undefined)?.value;
      if (typeof source === "string") {
        imports.push(source);
      }
    }

    collectParamAliases(node, context);

    if (node.type === "VariableDeclarator") {
      const name = nameOf(node.id);
      const init = unwrap(node.init);

      if (name !== null && init !== undefined) {
        if (init.type === "Identifier" && context.aliases.has(nameOf(init) ?? "")) {
          context.aliases.add(name);
        }
        if (isLabelsMember(init)) {
          context.aliases.add(name);
        }
        if (init.type === "ObjectExpression" || init.type === "ArrayExpression") {
          context.constants.set(name, constValues(init));
        }
      }
      collectDestructuredRoots(node.id, init, context);
    }
  });

  // Pass 2 — collect the longest member-expression chain rooted at a labels object.
  walk(parsed.program, (node, parent) => {
    if (node.type === "MemberExpression") {
      const intermediate = parent?.type === "MemberExpression" && parent.object === node;
      if (!intermediate) {
        const resolved = labelPath(node, context);
        if (resolved !== null) {
          const emptyPath = resolved.paths.some((segments) => segments.length === 0);

          if (resolved.dynamic) {
            // A dynamic key is bounded by the namespace it was read from;
            // selectPaths expands that prefix to its leaf paths later.
            const prefix = resolved.paths[0]?.join(".") ?? "";

            if (prefix.length > 0) {
              reads.add(prefix);
            } else {
              // No namespace to bound the read: the whole catalog is needed.
              full = true;
            }
          } else if (emptyPath) {
            // A bare `labels` alias is tracked through subsequent member reads.
            // Returning it escapes to unknown readers, so the whole catalog is
            // needed only in that case.
            if (parent?.type === "ReturnStatement") {
              full = true;
            }
          } else {
            for (const segments of resolved.paths) {
              reads.add(segments.join("."));
            }
          }
        }
      }
    }

    if (node.type === "SpreadElement" && isLabelExpression(node.argument, context)) {
      full = true;
    }

    if (node.type === "Identifier") {
      const name = nameOf(node);
      // A returned labels object escapes to unknown readers; calls are covered by
      // the import graph (helper files are attributed to their islands).
      if (name !== null && context.aliases.has(name) && parent?.type === "ReturnStatement") {
        full = true;
      }
    }
  });

  return { ids, imports, reads, full };
}

function resolveImport(root: string, importer: string, specifier: string): string | null {
  if (!specifier.startsWith(".") && !specifier.startsWith("~/")) {
    return null;
  }
  const base = specifier.startsWith("~/")
    ? path.join(root, specifier.slice(2))
    : path.resolve(path.dirname(importer), specifier);
  if (!base.startsWith(`${root}${path.sep}`)) {
    return null;
  }

  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ]) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function sourceFiles(dir: string, skip: Set<string>): string[] {
  const result: string[] = [];
  if (!existsSync(dir)) {
    return result;
  }
  for (const entry of readdirSync(dir, { withFileTypes: true }).toSorted((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    if (
      entry.isDirectory() &&
      (skip.has(path.resolve(dir, entry.name)) ||
        entry.name === "node_modules" ||
        entry.name === ".astro" ||
        entry.name === "dist")
    ) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...sourceFiles(full, skip));
    } else if (entry.isFile() && /\.(ts|tsx)$/u.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      result.push(full);
    }
  }
  return result;
}

interface IslandUsage {
  reads: Set<string>;
  full: boolean;
}

/** Attribute every file in an island's import neighbourhood to that island. */
function trackIslands(options: I18nOptions, typeFile: string): Map<string, IslandUsage> {
  const root = path.resolve(options.client.sourceDir);
  const skip = new Set(
    [options.client.outDir, options.server.outDir, path.dirname(typeFile)].map((entry) =>
      path.resolve(entry),
    ),
  );
  const analyzed = new Map<string, FileUsage>();
  for (const file of sourceFiles(root, skip)) {
    analyzed.set(file, analyze(readFileSync(file, "utf8"), file));
  }

  // Island neighbourhoods overlap heavily; resolve each (importer, specifier) only once.
  const resolvedImports = new Map<string, string | null>();
  const resolve = (importer: string, specifier: string): string | null => {
    const key = `${importer}\u0000${specifier}`;
    let target = resolvedImports.get(key);
    if (target === undefined) {
      target = resolveImport(root, importer, specifier);
      resolvedImports.set(key, target);
    }
    return target;
  };

  const usage = new Map<string, IslandUsage>();
  for (const [file, info] of analyzed) {
    if (info.ids.size === 0) {
      continue;
    }

    const reached = new Set<string>([file]);
    const queue = [file];
    // Appending during iteration is intentional: Array's iterator sees new elements.
    for (const current of queue) {
      const next = (analyzed.get(current)?.imports ?? []).map((specifier) =>
        resolve(current, specifier),
      );
      for (const target of next) {
        if (target !== null && !reached.has(target)) {
          reached.add(target);
          queue.push(target);
        }
      }
    }

    for (const id of info.ids) {
      if (usage.has(id)) {
        throw new Error(`i18n: duplicate island id "${id}" (${file})`);
      }
      const selected: IslandUsage = { reads: new Set<string>(), full: false };
      for (const reachedFile of reached) {
        const found = analyzed.get(reachedFile);
        if (found === undefined) {
          continue;
        }
        for (const read of found.reads) {
          selected.reads.add(read);
        }
        if (found.full) {
          selected.full = true;
        }
      }
      usage.set(id, selected);
    }
  }

  return usage;
}

// ---------------------------------------------------------------------------
// Code emission
// ---------------------------------------------------------------------------

function selectPaths(
  reads: Set<string>,
  reference: JsonObject,
  unit: string,
  clientNamespaces: string[],
): Set<string> {
  const result = new Set<string>();
  for (const read of reads) {
    const namespace = read.split(".")[0]!;
    if (namespace.endsWith(SERVER_NAMESPACE_SUFFIX)) {
      // Server-owned namespaces never enter a client island.
      continue;
    }
    let skipRead = false;
    let resolved = read;
    let node: unknown = reference;
    for (const segment of read.split(".")) {
      if (!isRecord(node) || !(segment in node)) {
        // A key may have moved to the `shared` namespace during the JSON
        // migration while a dynamic accessor still resolves its old name.
        const parts = read.split(".");
        const suffix = parts.length > 1 ? parts.slice(1).join(".") : read;
        const candidates = clientNamespaces.filter((candidate) => {
          let probe: unknown = reference[candidate];
          for (const part of suffix.split(".")) {
            if (!isRecord(probe) || !(part in probe)) return false;
            probe = probe[part];
          }
          return true;
        });
        if (candidates.length === 0) {
          // Alias tracking is file-wide; a same-named local variable in another
          // scope can contribute a JS member. Skip built-ins, not label keys.
          const member = suffix.split(".").at(-1) ?? "";

          if (
            JS_MEMBERS.has(member) &&
            !Object.values(reference).some((ns) => isRecord(ns) && Object.hasOwn(ns, member))
          ) {
            skipRead = true;
            break;
          }
          throw new Error(`i18n: unknown label path "${read}" tracked for ${unit}`);
        }
        resolved = candidates.includes("shared")
          ? `shared.${suffix}`
          : `${candidates[0]}.${suffix}`;
        node = reference;
        for (const part of resolved.split(".")) {
          if (!isRecord(node) || !(part in node)) {
            throw new Error(`i18n: unknown label path "${read}" tracked for ${unit}`);
          }
          node = node[part];
        }
        break;
      }
      node = node[segment];
    }
    if (skipRead) continue;
    if (isRecord(node)) {
      for (const leaf of leafPaths(node, resolved)) {
        result.add(leaf);
      }
    } else {
      result.add(resolved);
    }
  }
  return result;
}

function allPaths(reference: JsonObject, namespaces: string[]): Set<string> {
  const result = new Set<string>();
  for (const namespace of namespaces) {
    const content = reference[namespace];
    if (isRecord(content)) {
      for (const leaf of leafPaths(content, namespace)) {
        result.add(leaf);
      }
    }
  }
  return result;
}

function buildTree(paths: Set<string>): JsonObject {
  const tree: JsonObject = {};
  for (const currentPath of paths) {
    const segments = currentPath.split(".");
    let node = tree;
    for (let index = 0; index < segments.length - 1; index += 1) {
      const segment = segments[index]!;
      const existing = node[segment];
      if (existing === true) {
        break;
      }
      if (!isRecord(existing)) {
        node[segment] = {};
      }
      node = node[segment] as JsonObject;
    }
    node[segments[segments.length - 1]!] = true;
  }
  return tree;
}

function buildValues(paths: Set<string>, messages: JsonObject): JsonObject {
  const values: JsonObject = {};
  for (const currentPath of paths) {
    const segments = currentPath.split(".");
    const value = valueAt(messages, currentPath);
    let node = values;
    for (let index = 0; index < segments.length - 1; index += 1) {
      const segment = segments[index]!;
      const existing = node[segment];
      if (!isRecord(existing)) {
        node[segment] = {};
      }
      node = node[segment] as JsonObject;
    }
    node[segments[segments.length - 1]!] = Array.isArray(value) ? [...value] : value;
  }
  return values;
}

function relativeImport(fromFile: string, toFile: string): string {
  const relative = path.relative(path.dirname(fromFile), toFile).split(path.sep).join("/");
  const specifier = relative.startsWith(".") ? relative : `./${relative}`;
  return specifier.replace(/\.ts$/u, "");
}

function typeFileName(name: string): string {
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}Labels`;
}

function emitTypes(options: I18nOptions, reference: JsonObject): string {
  const { locales } = options;
  const localeUnion = locales.map((locale) => JSON.stringify(locale)).join(" | ");
  return [
    "// @boundary shared",
    "// Generated by plugins/i18n.ts — do not edit by hand.",
    `export const defaultMessages = ${JSON.stringify(reference, null, 2)} as const;`,
    "",
    "export type Messages = typeof defaultMessages;",
    "export type Namespace = keyof Messages;",
    "export type KeyOf<N extends Namespace> = keyof Messages[N];",
    `export const locales = ${JSON.stringify([...locales])} as const;`,
    `export type Locale = ${localeUnion};`,
    `export const defaultLocale = ${JSON.stringify(options.defaultLocale)} as const;`,
    `export function isLocale(value: string): value is Locale {`,
    `  switch (value) {`,
    ...locales.map((locale) => `    case ${JSON.stringify(locale)}:`),
    "      return true;",
    "    default:",
    "      return false;",
    "  }",
    `}`,
    `export const localeNames = ${JSON.stringify(options.localeNames, null, 2)} as const;`,
    "",
    "/** Recursive Pick over the dotted key paths tracked for one unit. */",
    "export type PickByPaths<T, Paths extends Record<string, unknown>> = {",
    "  [K in keyof T & keyof Paths]: Paths[K] extends true",
    "    ? T[K]",
    "    : Paths[K] extends Record<string, unknown>",
    "      ? T[K] extends Record<string, unknown>",
    "        ? PickByPaths<T[K], Paths[K]>",
    "        : T[K]",
    "      : never;",
    "};",
    "",
    "/** Widen default-locale literals so every locale's plain data fits the shape. */",
    "export type Widen<T> = T extends string",
    "  ? string",
    "  : T extends readonly unknown[]",
    "    ? { [I in keyof T]: string }",
    "    : T extends Record<string, unknown>",
    "      ? { [K in keyof T]: Widen<T[K]> }",
    "      : T;",
    "",
  ].join("\n");
}

function emitModule(
  unitName: string,
  paths: Set<string>,
  options: I18nOptions,
  messages: Record<string, JsonObject>,
  typeFile: string,
  outFile: string,
): string {
  const importPath = relativeImport(outFile, typeFile);
  const typeImports = "Messages, PickByPaths, Widen";
  const typeExpression = `PickByPaths<Messages, ${JSON.stringify(buildTree(paths), null, 2)}>`;

  const literals = options.locales.map((locale) =>
    JSON.stringify(buildValues(paths, messages[locale]!), null, 2),
  );
  const boundary = unitName.endsWith(SERVER_NAMESPACE_SUFFIX) ? "server" : "shared";
  const catalogEntries = options.locales
    .map((locale, index) => `  ${JSON.stringify(locale)}: ${literals[index]}`)
    .join(",\n");

  return [
    `// @boundary ${boundary}`,
    "// Generated by plugins/i18n.ts — do not edit by hand.",
    `import type { ${typeImports} } from ${JSON.stringify(importPath)};`,
    'import type { Locale } from "~/platform/i18n";',
    "",
    `type Labels = Widen<${typeExpression}>;`,
    "",
    `const catalogs: Record<Locale, Labels> = {
${catalogEntries},
};`,
    "",
    "export function localized(locale: Locale): Labels {",
    `  return catalogs[locale] ?? catalogs[${JSON.stringify(options.defaultLocale)}];`,
    "}",
    "",
    `export type ${typeFileName(unitName)} = Labels;`,
    "",
  ].join("\n");
}

function writeIfChanged(file: string, content: string): void {
  if (existsSync(file) && readFileSync(file, "utf8") === content) {
    return;
  }
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content, "utf8");
}

/** Keep only the namespaces owned by the client (everything without the `ApiMessages` suffix). */
function isServerNamespace(namespace: string): boolean {
  return namespace.endsWith(SERVER_NAMESPACE_SUFFIX);
}

/**
 * Generate all i18n modules from the JSON translations and island sources.
 *
 * The shared type module is written to the parent of `client.outDir`
 * (`src/generated/client` -> `src/generated/i18n-types.ts`). Generated modules
 * import it by a computed relative path; `Locale` stays imported from
 * `~/platform/i18n`. Files are only written when their content hash changes.
 */
function pruneGenerated(dir: string, expected: ReadonlySet<string>): void {
  if (!existsSync(dir)) {
    return;
  }

  for (const entry of readdirSync(dir, { withFileTypes: true }).toSorted((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    if (!entry.isFile() || !entry.name.endsWith(".ts")) {
      continue;
    }

    const file = path.join(dir, entry.name);

    if (
      !expected.has(file) &&
      readFileSync(file, "utf8").includes("// Generated by plugins/i18n.ts")
    ) {
      rmSync(file);
    }
  }
}

export async function generateI18n(options: I18nOptions): Promise<void> {
  const messages = loadMessages(options);
  const reference = messages[options.defaultLocale]!;
  const namespaces = Object.keys(reference);
  const clientNamespaces = namespaces.filter((namespace) => !isServerNamespace(namespace));
  const serverNamespaces = namespaces.filter(isServerNamespace);

  // The shared type module lives in the parent of `client.outDir`:
  // e.g. `src/generated/client` -> `src/generated/i18n-types.ts`.
  const typeFile = path.join(path.dirname(path.resolve(options.client.outDir)), "i18n-types.ts");
  writeIfChanged(typeFile, emitTypes(options, reference));

  // The compiled locale schema must stay server-only; importing it from the
  // shared type module would pull ArkType runtime into every client page.
  const localeSchemaFile = path.join(path.resolve(options.server.outDir), "locale.ts");
  const localeTypeExpression = options.locales.map((locale) => `'${locale}'`).join(" | ");
  writeIfChanged(
    localeSchemaFile,
    [
      "// @boundary server",
      "// Generated by plugins/i18n.ts — do not edit by hand.",
      `import { type } from "arktype";`,
      "",
      `export const localeSchema = type(${JSON.stringify(localeTypeExpression)});`,
      "",
    ].join("\n"),
  );

  const usage = trackIslands(options, typeFile);
  // Full client catalog for Astro frontmatter (never shipped to the client).
  const allFile = path.join(path.resolve(options.client.outDir), "all.ts");
  const allPathsSet = allPaths(reference, clientNamespaces);

  writeIfChanged(allFile, emitModule("all", allPathsSet, options, messages, typeFile, allFile));

  for (const [id, found] of usage) {
    const paths = found.full
      ? allPaths(reference, clientNamespaces)
      : selectPaths(found.reads, reference, id, clientNamespaces);
    const outFile = path.join(path.resolve(options.client.outDir), `${id}.ts`);

    writeIfChanged(outFile, emitModule(id, paths, options, messages, typeFile, outFile));
  }

  for (const namespace of serverNamespaces) {
    const paths = allPaths(reference, [namespace]);
    const outFile = path.join(path.resolve(options.server.outDir), `${namespace}.ts`);

    writeIfChanged(outFile, emitModule(namespace, paths, options, messages, typeFile, outFile));
  }
  const clientDir = path.resolve(options.client.outDir);
  const serverDir = path.resolve(options.server.outDir);
  const expectedClient = new Set([allFile]);
  const expectedServer = new Set([localeSchemaFile]);

  for (const id of usage.keys()) {
    expectedClient.add(path.join(clientDir, `${id}.ts`));
  }
  for (const namespace of serverNamespaces) {
    expectedServer.add(path.join(serverDir, `${namespace}.ts`));
  }

  pruneGenerated(clientDir, expectedClient);
  pruneGenerated(serverDir, expectedServer);
}

export function i18nIntegration(options: I18nOptions): AstroIntegration {
  return {
    name: "i18n",
    hooks: {
      "astro:config:setup": async () => {
        await generateI18n(options);
      },
    },
  };
}
