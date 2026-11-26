// @boundary server
import { readFileSync } from "node:fs";
import path from "node:path";

type Scope = "astro" | "client" | "server" | "shared";

interface RuleOptions {
  /** Repo root used to resolve import specifiers. Defaults to the lint cwd. */
  root?: string;
  /** Files with no boundary rules at all, repo-relative. */
  exempt?: string[];
  /** Files whose marker is checked but whose imports are not, repo-relative. */
  importExempt?: string[];
  /** Repo-relative path prefixes client code may import from server scope. */
  allowedServerTypes?: string[];
}

interface NodeLike {
  type: string;
  source?: unknown;
}

interface RuleContext {
  filename: string;
  cwd: string;
  options: readonly unknown[];
  sourceCode: { getText: () => string };
  report: (descriptor: {
    node: NodeLike;
    messageId: "forbidden" | "missing";
    data: Record<string, string>;
  }) => void;
}

interface Rule {
  meta: {
    type: "problem";
    docs: { description: string };
    schema: readonly [Record<string, unknown>];
    messages: Record<string, string>;
  };
  create: (context: RuleContext) => Record<string, (node: NodeLike) => void>;
}

interface Settings {
  root: string;
  exempt: ReadonlySet<string>;
  importExempt: ReadonlySet<string>;
  allowedServerTypes: readonly string[];
}

const frontmatterCache = new Map<string, string | null>();
const markerCache = new Map<string, Scope | null>();
const reportedWithoutFrontmatter = new Set<string>();

function isOptions(value: unknown): value is RuleOptions {
  return typeof value === "object" && value !== null;
}

function settingsOf(context: RuleContext): Settings {
  const [first] = context.options;
  const options = isOptions(first) ? first : {};

  return {
    root: path.resolve(context.cwd, options.root ?? "."),
    exempt: new Set(options.exempt),
    importExempt: new Set(options.importExempt),
    allowedServerTypes: options.allowedServerTypes ?? [],
  };
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

/** Repo-relative path for files under `src/`, or `null` for everything else. */
function sourceFile(filename: string, root: string): string | null {
  const relative = toPosix(path.relative(root, filename));

  return relative.startsWith("src/") ? relative : null;
}

/** Frontmatter text of an Astro file, normalized the way Oxlint extracts it. */
function frontmatterOf(filename: string): string | null {
  const cached = frontmatterCache.get(filename);

  if (cached !== undefined) {
    return cached;
  }

  const body =
    /^---\r?\n(?<body>(?:[^\n]*\n)*?)---(?:\r?\n|$)/u.exec(readFileSync(filename, "utf8"))?.groups
      ?.body ?? null;

  frontmatterCache.set(filename, body);
  return body;
}

/** Read the boundary marker from a file's first non-empty line (or Astro frontmatter). */
function markerOf(source: string): Scope | null {
  const firstLine = source.split(/\r?\n/u).find((line) => line.trim().length > 0) ?? "";
  const match = /^\s*\/\/ @boundary (?<scope>astro|client|server|shared)\s*$/u.exec(firstLine);
  const scope = match?.groups?.scope;

  return scope === "astro" || scope === "client" || scope === "server" || scope === "shared"
    ? scope
    : null;
}

/** Marker of an import target, read from disk and cached for the lint session. */
function markerOfFile(filename: string): Scope | null {
  const cached = markerCache.get(filename);

  if (cached !== undefined) {
    return cached;
  }

  let source: string | null = null;

  for (const candidate of [
    filename,
    `${filename}.ts`,
    `${filename}.tsx`,
    `${filename}.astro`,
    path.join(filename, "index.ts"),
  ]) {
    try {
      source = readFileSync(candidate, "utf8");
      break;
    } catch {
      // Try the next candidate.
    }
  }

  if (source === null) {
    markerCache.set(filename, null);
    return null;
  }

  const body = filename.endsWith(".astro") ? frontmatterOf(filename) : null;
  const marker = markerOf(body ?? source);

  markerCache.set(filename, marker);
  return marker;
}

function resolveImport(root: string, from: string, specifier: string): string | null {
  if (specifier.startsWith("~/")) {
    return `src/${specifier.slice(2)}`;
  }

  if (specifier.startsWith(".")) {
    const importer = path.dirname(path.join(root, from));

    return toPosix(path.relative(root, path.resolve(importer, specifier)));
  }

  return null;
}

function specifierOf(node: NodeLike): string | null {
  const source: unknown = node.source;

  if (typeof source !== "object" || source === null) {
    return null;
  }

  const value: unknown = "value" in source ? source.value : undefined;

  return typeof value === "string" ? value : null;
}

/** Scope of an illegal import target, or `null` when the import is allowed. */
function violation(settings: Settings, from: Scope, target: string): Scope | null {
  const to = markerOfFile(path.join(settings.root, target));

  // Unmarked targets are outside this rule's reach.
  if (to === null) {
    return null;
  }

  if (from === "astro") {
    return null;
  }

  if (from === "client") {
    const allowed =
      to !== "server" || settings.allowedServerTypes.some((prefix) => target.startsWith(prefix));

    return allowed ? null : to;
  }

  if (from === "server") {
    return to === "client" ? to : null;
  }

  return to === "shared" ? null : to;
}

const messages = {
  missing: "{{file}} is missing a valid // @boundary marker",
  forbidden: "{{file}} ({{marker}}) imports {{specifier}} ({{to}})",
} as const;

const boundaryRule: Rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Require a `// @boundary` marker and restrict imports between scopes",
    },
    schema: [
      {
        type: "object",
        properties: {
          root: { type: "string" },
          exempt: { type: "array", items: { type: "string" } },
          importExempt: { type: "array", items: { type: "string" } },
          allowedServerTypes: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    messages,
  },
  create(context) {
    const settings = settingsOf(context);
    const file = sourceFile(context.filename, settings.root);

    if (file === null || settings.exempt.has(file)) {
      return {};
    }

    // Oxlint lints Astro frontmatter and every `<script>` block as separate
    // programs. Only the frontmatter carries the marker.
    if (file.endsWith(".astro")) {
      const frontmatter = frontmatterOf(context.filename);

      if (frontmatter !== null && context.sourceCode.getText() !== frontmatter) {
        return {};
      }

      if (frontmatter === null && reportedWithoutFrontmatter.has(context.filename)) {
        return {};
      }

      reportedWithoutFrontmatter.add(context.filename);
    }

    const marker = markerOf(context.sourceCode.getText());

    if (marker === null) {
      return {
        Program: (node) => {
          context.report({ node, messageId: "missing", data: { file } });
        },
      };
    }

    if (settings.importExempt.has(file)) {
      return {};
    }

    const checkImport = (node: NodeLike): void => {
      const specifier = specifierOf(node);

      if (specifier === null) {
        return;
      }

      const target = resolveImport(settings.root, file, specifier);

      if (target?.startsWith("src/") !== true) {
        return;
      }

      const to = violation(settings, marker, target);

      if (to !== null) {
        context.report({
          node,
          messageId: "forbidden",
          data: { file, marker, specifier, to },
        });
      }
    };

    return {
      ImportDeclaration: checkImport,
      ExportNamedDeclaration: checkImport,
      ExportAllDeclaration: checkImport,
      ImportExpression: checkImport,
    };
  },
};

const boundaryPlugin = {
  meta: { name: "boundary" },
  rules: { scopes: boundaryRule },
};

export default boundaryPlugin;
