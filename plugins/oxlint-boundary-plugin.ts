// @boundary server
import { readFileSync } from "node:fs";
import path from "node:path";

type Scope = "astro" | "client" | "server" | "shared";

interface RuleOptions {
  /** Repo root the path scopes are computed from. Defaults to the lint cwd. */
  root?: string;
  /** Path segments that make a file server-only. */
  serverSegments?: string[];
  /** Path segments that make a file client-only. */
  clientSegments?: string[];
  /** Path segments that make a file an Astro entrypoint. */
  astroSegments?: string[];
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
    messageId: "forbidden" | "mismatch" | "missing";
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
  serverSegments: ReadonlySet<string>;
  clientSegments: ReadonlySet<string>;
  astroSegments: ReadonlySet<string>;
  exempt: ReadonlySet<string>;
  importExempt: ReadonlySet<string>;
  allowedServerTypes: readonly string[];
}

const frontmatterCache = new Map<string, string | null>();
const reportedWithoutFrontmatter = new Set<string>();

function isOptions(value: unknown): value is RuleOptions {
  return typeof value === "object" && value !== null;
}

function settingsOf(context: RuleContext): Settings {
  const [first] = context.options;
  const options = isOptions(first) ? first : {};

  return {
    root: path.resolve(context.cwd, options.root ?? "."),
    serverSegments: new Set(options.serverSegments),
    clientSegments: new Set(options.clientSegments),
    astroSegments: new Set(options.astroSegments),
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

function scopeOf(file: string, settings: Settings): Scope {
  const segments = file.split("/");
  const scopeRoot = segments[1];

  if (scopeRoot !== undefined && settings.astroSegments.has(scopeRoot)) {
    return "astro";
  }

  if (segments.some((segment) => settings.clientSegments.has(segment))) {
    return "client";
  }

  if (
    (scopeRoot !== undefined && settings.serverSegments.has(scopeRoot)) ||
    segments.some((segment) => settings.serverSegments.has(segment)) ||
    segments.length === 2
  ) {
    return "server";
  }

  return "shared";
}

function markerOf(source: string): Scope | null {
  const firstLine = source.split(/\r?\n/u).find((line) => line.trim().length > 0) ?? "";
  const match = /^\s*\/\/ @boundary (?<scope>astro|client|server|shared)\s*$/u.exec(firstLine);
  const scope = match?.groups?.scope;

  return scope === "astro" || scope === "client" || scope === "server" || scope === "shared"
    ? scope
    : null;
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
  const to = scopeOf(target, settings);

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

/**
 * Frontmatter text of an Astro file, normalized the way Oxlint extracts it.
 * `null` means the file has no frontmatter block.
 */
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

const messages = {
  missing: "{{file}} is missing a valid // @boundary marker",
  mismatch: '{{file}} marker is "{{marker}}" but its path is "{{expected}}"',
  forbidden: "{{file}} ({{marker}}) imports {{specifier}} ({{to}})",
} as const;

const boundaryRule: Rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require a `// @boundary` marker matching the path scope and restrict imports between scopes",
    },
    schema: [
      {
        type: "object",
        properties: {
          root: { type: "string" },
          serverSegments: { type: "array", items: { type: "string" } },
          clientSegments: { type: "array", items: { type: "string" } },
          astroSegments: { type: "array", items: { type: "string" } },
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
    // programs. Only the frontmatter carries the marker; template scripts were
    // never part of the boundary check.
    if (file.endsWith(".astro")) {
      const frontmatter = frontmatterOf(context.filename);

      if (frontmatter !== null && context.sourceCode.getText() !== frontmatter) {
        return {};
      }

      if (frontmatter === null) {
        // No frontmatter: report once per file, on whichever program comes first.
        if (reportedWithoutFrontmatter.has(context.filename)) {
          return {};
        }

        reportedWithoutFrontmatter.add(context.filename);
      }
    }

    const marker = markerOf(context.sourceCode.getText());

    if (marker === null) {
      return {
        Program: (node) => {
          context.report({ node, messageId: "missing", data: { file } });
        },
      };
    }

    const expected = scopeOf(file, settings);

    if (marker !== expected) {
      return {
        Program: (node) => {
          context.report({ node, messageId: "mismatch", data: { file, marker, expected } });
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
