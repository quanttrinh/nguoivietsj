import { readFile, readdir, writeFile } from "node:fs/promises";

import type { AstroIntegration } from "astro";
import { init, parse } from "es-module-lexer";
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

async function importsOf(source: string): Promise<string[]> {
  await init();
  const [imports] = parse(source);

  return imports.flatMap((item) =>
    (item.type === "static" || item.type === "reexport-star") && item.specifier.endsWith(".js")
      ? [item.specifier]
      : [],
  );
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

  const specifiers = await importsOf(source);
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
  const entries: URL[] = [];
  const existing = new Set<string>();
  let head: Element | undefined = undefined;

  walk(document, (element) => {
    if (element.tagName === "head") {
      head = element;
    }

    if (element.tagName === "script" && attribute(element, "type") === "module") {
      const src = attribute(element, "src");

      if (src?.endsWith(".js") === true) {
        entries.push(new URL(src.slice(1), root));
      }
    }

    if (element.tagName === "link" && attribute(element, "rel") === MODULE_PRELOAD) {
      const href = attribute(element, "href");

      if (href !== undefined) {
        existing.add(href);
      }
    }
  });

  if (head === undefined || entries.length === 0) {
    return html;
  }

  const dependencies = new Set<string>();

  await Promise.all(entries.map((entry) => collectDependencies(entry, root, dependencies)));

  for (const entry of entries) {
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
    entries.map((entry) => {
      const url = new URL(entry.isDirectory() ? `${entry.name}/` : entry.name, dir);

      if (entry.isDirectory()) {
        return htmlFiles(url);
      }

      return Promise.resolve(entry.name.endsWith(".html") ? [url] : []);
    }),
  );

  return files.flat();
}

/** Add build-time modulepreload hints for each static page's entry graph. */
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
