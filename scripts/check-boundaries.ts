import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import matter from "gray-matter";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = path.join(ROOT, "src");
const EXTENSIONS = new Set([".ts", ".tsx", ".astro"]);

const SERVER_SEGMENTS = new Set(["server", "db", "services", "backfills"]);
const CLIENT_SEGMENTS = new Set(["ui", "client"]);
const ASTRO_SEGMENTS = new Set(["pages", "layouts"]);

type Scope = "astro" | "client" | "server" | "shared";

async function filesIn(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = entries.flatMap((entry) => {
    const absolute = path.join(directory, entry.name);

    return !entry.isDirectory() && EXTENSIONS.has(path.extname(entry.name))
      ? [path.relative(ROOT, absolute).split(path.sep).join("/")]
      : [];
  });
  const groups = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => filesIn(path.join(directory, entry.name))),
  );

  return [...files, ...groups.flat()];
}

function scopeOf(file: string): Scope {
  const segments = file.split("/");
  const scopeRoot = segments[1];

  if (scopeRoot !== undefined && ASTRO_SEGMENTS.has(scopeRoot)) {
    return "astro";
  }

  if (segments.some((segment) => CLIENT_SEGMENTS.has(segment))) {
    return "client";
  }

  if (
    (scopeRoot !== undefined && SERVER_SEGMENTS.has(scopeRoot)) ||
    segments.some((segment) => SERVER_SEGMENTS.has(segment)) ||
    segments.length === 2
  ) {
    return "server";
  }

  return "shared";
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

function resolveImport(from: string, specifier: string): string | null {
  if (specifier.startsWith("~/")) {
    return `src/${specifier.slice(2)}`;
  }

  if (specifier.startsWith(".")) {
    const importer = path.dirname(path.join(ROOT, from));
    return toPosix(path.relative(ROOT, path.resolve(importer, specifier)));
  }

  return null;
}

function frontmatterOf(source: string): string {
  // Astro frontmatter is TypeScript, not YAML. Use a no-op engine so
  // gray-matter only extracts the block without parsing it as YAML.
  return matter(source, { engines: { yaml: (): object => ({}) } }).matter;
}

function markerFor(file: string, source: string): Scope | null {
  const body = file.endsWith(".astro") ? frontmatterOf(source) : source;
  const firstLine = body.split(/\r?\n/u).find((line) => line.trim().length > 0) ?? "";
  const match = /^\s*\/\/ @boundary (?<scope>astro|client|server|shared)\s*$/u.exec(firstLine);
  const scope = match?.groups?.scope;

  return scope === "astro" || scope === "client" || scope === "server" || scope === "shared"
    ? scope
    : null;
}

function moduleCode(file: string, source: string): { code: string; kind: ts.ScriptKind } {
  if (file.endsWith(".astro")) {
    return { code: frontmatterOf(source), kind: ts.ScriptKind.TS };
  }

  return {
    code: source,
    kind: file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  };
}

function importsIn(file: string, source: string): string[] {
  const { code, kind } = moduleCode(file, source);
  const parsed = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, kind);
  const imports = new Set<string>();

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.add(node.moduleSpecifier.text);
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      imports.add(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] !== undefined &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      imports.add(node.arguments[0].text);
    }

    ts.forEachChild(node, visit);
  };

  visit(parsed);
  return [...imports];
}

function isAllowed(from: Scope, to: Scope, target: string): boolean {
  if (from === "astro") {
    return true;
  }

  if (from === "client") {
    return to !== "server" || target.startsWith("src/types/api");
  }

  if (from === "server") {
    return to !== "client";
  }

  return to === "shared";
}

async function violationsFor(file: string): Promise<string[]> {
  if (file === "src/types/worker-configuration.d.ts") {
    return [];
  }

  const source = await readFile(path.join(ROOT, file), "utf8");
  const marker = markerFor(file, source);

  if (marker === null) {
    return [`${file} is missing a valid // @boundary marker`];
  }

  const expected = scopeOf(file);

  if (marker !== expected) {
    return [`${file} marker is "${marker}" but its path is "${expected}"`];
  }

  if (file === "src/types/api.d.ts") {
    return [];
  }

  const violations: string[] = [];

  for (const specifier of importsIn(file, source)) {
    const target = resolveImport(file, specifier);

    if (target?.startsWith("src/") === true) {
      const to = scopeOf(target);

      if (!isAllowed(marker, to, target)) {
        violations.push(`${file} (${marker}) imports ${specifier} (${to})`);
      }
    }
  }

  return violations;
}

const files = await filesIn(SRC);
const results = await Promise.all(files.map((file) => violationsFor(file)));
const problems = results.flat();

if (problems.length > 0) {
  console.error("Client/server boundary violations:");
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  process.exitCode = 1;
} else {
  console.log("Client/server import boundaries are clean.");
}
