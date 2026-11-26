/* oxlint-disable no-unsafe-assignment, no-unnecessary-condition, no-non-null-assertion, no-map-spread, no-nested-ternary, max-params, prefer-at, no-continue, max-depth, prefer-named-capture-group, curly, no-array-callback-reference -- Build-time generator with validated lookups. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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

// ---------------------------------------------------------------------------
// Source tracking (oxc)
// ---------------------------------------------------------------------------

type AstNode = Record<string, unknown> & { type?: string };

interface AnalyzeContext {
  /** Identifiers that hold a labels object. */
  aliases: Set<string>;
  /** Identifiers bound to a namespace (or deeper node) of the labels object. */
  namespaceRoots: Map<string, string[]>;
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
    return property?.type === "Literal" && property.value === "labels";
  }
  return nameOf(node.property) === "labels";
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
  for (const param of Array.isArray(node.params) ? node.params : []) {
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
      context.aliases.add(name);
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
    if (key !== null && local !== null) {
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
    aliases: new Set(["labels"]),
    namespaceRoots: new Map(),
    constants: new Map(),
  };
  const isIsland = filename.includes("/ui/") && filename.endsWith(".tsx");

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
          if (resolved.dynamic || resolved.paths.some((segments) => segments.length === 0)) {
            full = true;
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
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (
      entry.isDirectory() &&
      (skip.has(entry.name) ||
        entry.name === "generated" ||
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
      path.basename(path.resolve(entry)),
    ),
  );
  const analyzed = new Map<string, FileUsage>();
  for (const file of sourceFiles(root, skip)) {
    analyzed.set(file, analyze(readFileSync(file, "utf8"), file));
  }

  const importers = new Map<string, string[]>();
  for (const [file, info] of analyzed) {
    for (const specifier of info.imports) {
      const target = resolveImport(root, file, specifier);
      if (target === null) {
        continue;
      }
      const list = importers.get(target) ?? [];
      list.push(file);
      importers.set(target, list);
    }
  }

  const usage = new Map<string, IslandUsage>();
  for (const [file, info] of analyzed) {
    if (info.ids.size === 0) {
      continue;
    }

    const reached = new Set<string>([file]);
    const queue = [file];
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) {
        continue;
      }
      const next = (analyzed.get(current)?.imports ?? []).map((specifier) =>
        resolveImport(root, current, specifier),
      );
      if (current === file) {
        next.push(...(importers.get(file) ?? []));
      }
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

interface Selection {
  /** `tree`: exact leaf paths; `namespaces`: every key of the listed namespaces. */
  mode: "tree" | "namespaces";
  paths: Set<string>;
  namespaces: string[];
}

function selectPaths(
  reads: Set<string>,
  reference: JsonObject,
  unit: string,
  clientNamespaces: string[],
): Set<string> {
  const result = new Set<string>();
  for (const read of reads) {
    const namespace = read.split(".")[0]!;
    if (namespace.endsWith("ApiMessages")) {
      // Server-owned namespaces never enter a client island.
      continue;
    }
    let resolved = read;
    let node: unknown = reference;
    let skipRead = false;
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
          // scope can contribute a JS member. Skip those, not real label keys.
          const member = suffix.split(".").at(-1) ?? "";
          const JS_MEMBERS = new Set([
            "length",
            "trim",
            "split",
            "includes",
            "map",
            "filter",
            "join",
            "slice",
            "substring",
            "toLowerCase",
            "toUpperCase",
            "replace",
            "startsWith",
            "endsWith",
            "trimStart",
            "trimEnd",
            "charAt",
            "indexOf",
            "toString",
            "padStart",
            "padEnd",
            "at",
            "concat",
            "forEach",
            "reduce",
            "find",
            "some",
            "every",
            "sort",
            "reverse",
            "flat",
            "values",
            "keys",
            "entries",
          ]);
          if (JS_MEMBERS.has(member)) {
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

function indent(text: string, spaces: number): string {
  const prefix = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
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
    `export const DEFAULT_LOCALE = defaultLocale;`,
    `export const SUPPORTED_LOCALES: ReadonlySet<string> = new Set<string>(locales);`,
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
  selection: Selection,
  options: I18nOptions,
  messages: Record<string, JsonObject>,
  reference: JsonObject,
  typeFile: string,
  outFile: string,
): string {
  const importPath = relativeImport(outFile, typeFile);
  const typeImports =
    selection.mode === "tree" ? "Messages, PickByPaths, Widen" : "Messages, Widen";
  const typeExpression =
    selection.mode === "tree"
      ? `PickByPaths<Messages, ${JSON.stringify(buildTree(selection.paths), null, 2)}>`
      : `Pick<Messages, ${selection.namespaces.map((namespace) => JSON.stringify(namespace)).join(" | ")}>`;
  const paths =
    selection.mode === "tree" ? selection.paths : allPaths(reference, selection.namespaces);

  const literals = options.locales.map((locale) =>
    JSON.stringify(buildValues(paths, messages[locale]!), null, 2),
  );
  const cases = options.locales
    .map((locale, index) =>
      [
        `    case ${JSON.stringify(locale)}:`,
        `      return ${indent(literals[index]!, 6).trimStart()};`,
      ].join("\n"),
    )
    .join("\n");
  const fallback = indent(literals[0]!, 6).trimStart();

  return [
    "// @boundary shared",
    "// Generated by plugins/i18n.ts — do not edit by hand.",
    `import type { ${typeImports} } from ${JSON.stringify(importPath)};`,
    'import type { Locale } from "~/platform/i18n";',
    "",
    `type Labels = Widen<${typeExpression}>;`,
    "",
    "export function localized(locale: Locale): Labels {",
    "  switch (locale) {",
    cases,
    "    default:",
    `      return ${fallback};`,
    "  }",
    "}",
    "",
    `export type ${typeFileName(unitName)} = Labels;`,
    "",
  ].join("\n");
}

function writeIfChanged(file: string, content: string): void {
  const hash = createHash("sha256").update(content).digest("hex");
  if (existsSync(file)) {
    const previous = createHash("sha256").update(readFileSync(file, "utf8")).digest("hex");
    if (previous === hash) {
      return;
    }
  }
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content, "utf8");
}

/** Keep only the namespaces owned by the client (everything without the `ApiMessages` suffix). */
function isServerNamespace(namespace: string): boolean {
  return namespace.endsWith("ApiMessages");
}

/**
 * Generate all i18n modules from the JSON translations and island sources.
 *
 * The shared type module is written to the parent of `client.outDir`
 * (`src/generated/client` -> `src/generated/i18n-types.ts`). Generated modules
 * import it by a computed relative path; `Locale` stays imported from
 * `~/platform/i18n`. Files are only written when their content hash changes.
 */
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

  const usage = trackIslands(options, typeFile);
  // Full client catalog for Astro frontmatter (never shipped to the client).
  const allSelection: Selection = {
    mode: "namespaces",
    namespaces: clientNamespaces,
    paths: new Set(),
  };
  const allFile = path.join(path.resolve(options.client.outDir), "all.ts");
  writeIfChanged(
    allFile,
    emitModule("all", allSelection, options, messages, reference, typeFile, allFile),
  );

  for (const [id, found] of usage) {
    const selection: Selection = found.full
      ? { mode: "namespaces", namespaces: clientNamespaces, paths: new Set() }
      : {
          mode: "tree",
          namespaces: [],
          paths: selectPaths(found.reads, reference, id, clientNamespaces),
        };
    const outFile = path.join(path.resolve(options.client.outDir), `${id}.ts`);
    writeIfChanged(
      outFile,
      emitModule(id, selection, options, messages, reference, typeFile, outFile),
    );
  }

  for (const namespace of serverNamespaces) {
    const selection: Selection = {
      mode: "namespaces",
      namespaces: [namespace],
      paths: new Set(),
    };
    const outFile = path.join(path.resolve(options.server.outDir), `${namespace}.ts`);
    writeIfChanged(
      outFile,
      emitModule(namespace, selection, options, messages, reference, typeFile, outFile),
    );
  }
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
