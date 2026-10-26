/* oxlint-disable typescript/no-unsafe-type-assertion -- HTML namespaces are narrowed at this build-tool boundary. */
import { readFile, readdir, writeFile } from "node:fs/promises";

import { type AstroIntegration } from "astro";
import { parseSync } from "oxc-parser";
import {
  defaultTreeAdapter,
  parse as parseHtml,
  serialize,
  type DefaultTreeAdapterMap,
} from "parse5";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];

type Namespace = Parameters<typeof defaultTreeAdapter.createElement>[1];

// oxlint-disable-next-line typescript/no-unsafe-enum-assignment -- parse5 does not export its NS enum.
const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml" as Namespace;
const MODULE_PRELOAD = "modulepreload";

function isElement(node: Node): node is Element {
  return "tagName" in node;
}

function attribute(element: Element, name: string): string | undefined {
  return element.attrs.find((item) => item.name === name)?.value;
}

function localScriptUrl(value: string | undefined, root: URL): URL | null {
  if (value?.startsWith("/") !== true || !value.endsWith(".js")) {
    return null;
  }

  return new URL(value.slice(1), root);
}

function scriptUrl(element: Element, name: string, root: URL): URL | null {
  return localScriptUrl(attribute(element, name), root);
}

function walk(node: Node, visit: (element: Element) => void): void {
  if (isElement(node)) {
    visit(node);
  }

  if ("childNodes" in node) {
    for (const child of node.childNodes) {
      walk(child, visit);
    }
  }
}

/** Static JavaScript imports and re-exports, filtered to local JS modules. */
export function staticJsImports(source: string, filename: string): string[] {
  const result = parseSync(filename, source, { lang: "js", sourceType: "module" });

  if (result.errors.length > 0) {
    throw new Error(
      `Failed to parse ${filename}: ${result.errors[0]?.message ?? "unknown parser error"}`,
    );
  }

  const imports = result.module.staticImports.map((item) => item.moduleRequest.value);
  const reexports = result.module.staticExports.flatMap((item) =>
    item.entries.flatMap((entry) =>
      entry.moduleRequest === null ? [] : [entry.moduleRequest.value],
    ),
  );

  return [...imports, ...reexports].filter((specifier) => specifier.endsWith(".js"));
}

function resolveUrl(specifier: string, importer: URL, root: URL): URL {
  return specifier.startsWith("/")
    ? new URL(specifier.slice(1), root)
    : new URL(specifier, importer);
}

async function collectDependencies(script: URL, root: URL, seen: Set<string>): Promise<void> {
  if (seen.has(script.href)) {
    return;
  }

  seen.add(script.href);
  const source = await readFile(script, "utf8").catch(() => null);

  if (source === null) {
    return;
  }

  const specifiers = staticJsImports(source, script.pathname);
  const dependencies = specifiers.map((specifier) => resolveUrl(specifier, script, root));

  await Promise.all(dependencies.map((dependency) => collectDependencies(dependency, root, seen)));
}

function publicPath(url: URL, root: URL): string {
  const rootPath = root.pathname.endsWith("/") ? root.pathname : `${root.pathname}/`;

  return url.pathname.startsWith(rootPath)
    ? `/${url.pathname.slice(rootPath.length)}`
    : url.pathname;
}

async function withModulePreloads(html: string, root: URL): Promise<string> {
  const document = parseHtml(html);
  const scriptEntries: URL[] = [];
  const islandEntries: URL[] = [];
  const existing = new Set<string>();
  const heads: Element[] = [];

  walk(document, (element) => {
    if (element.tagName === "head") {
      heads.push(element);
    }

    if (element.tagName === "script" && attribute(element, "type") === "module") {
      const entry = scriptUrl(element, "src", root);

      if (entry !== null) {
        scriptEntries.push(entry);
      }
    }

    if (element.tagName === "astro-island" && attribute(element, "client") === "load") {
      for (const name of ["component-url", "renderer-url"]) {
        const entry = scriptUrl(element, name, root);

        if (entry !== null) {
          islandEntries.push(entry);
        }
      }
    }

    if (element.tagName === "link" && attribute(element, "rel") === MODULE_PRELOAD) {
      const href = attribute(element, "href");

      if (href !== undefined) {
        existing.add(href);
      }
    }
  });

  const head = heads[0];

  if (head === undefined || (scriptEntries.length === 0 && islandEntries.length === 0)) {
    return html;
  }

  const dependencies = new Set<string>();
  const entries = [...scriptEntries, ...islandEntries];

  await Promise.all(entries.map((entry) => collectDependencies(entry, root, dependencies)));

  /*
   * The script entries are fetched by their own tags. Island component URLs are
   * loaded later by the Astro runtime, so preload those as well.
   */
  for (const entry of scriptEntries) {
    dependencies.delete(entry.href);
  }

  const preloads = [...dependencies]
    .map((href) => publicPath(new URL(href), root))
    .filter((href) => !existing.has(href))
    .toSorted();

  for (const href of preloads) {
    const link = defaultTreeAdapter.createElement("link", HTML_NAMESPACE, [
      { name: "rel", value: MODULE_PRELOAD },
      { name: "href", value: href },
    ]);

    defaultTreeAdapter.appendChild(head, link);
  }

  return serialize(document);
}

async function htmlFiles(dir: URL): Promise<URL[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const url = new URL(entry.isDirectory() ? `${entry.name}/` : entry.name, dir);

      if (entry.isDirectory()) {
        const nested = await htmlFiles(url);
        return nested;
      }

      return entry.name.endsWith(".html") ? [url] : [];
    }),
  );

  return files.flat();
}

/** Add build-time modulepreload hints for entry scripts and eager Astro islands. */
export function modulePreloads(): AstroIntegration {
  return {
    name: "module-preloads",
    hooks: {
      "astro:build:done": async ({ dir }) => {
        const files = await htmlFiles(dir);

        await Promise.all(
          files.map(async (file) => {
            const html = await readFile(file, "utf8");
            const result = await withModulePreloads(html, dir);

            if (result !== html) {
              await writeFile(file, result);
            }
          }),
        );
      },
    },
  };
}
