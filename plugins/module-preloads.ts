/* oxlint-disable typescript/no-unsafe-type-assertion -- HTML namespaces are narrowed at this build-tool boundary. */
import { readFile, readdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

import type { AstroIntegration } from "astro";
import { parseSync } from "oxc-parser";
import {
  defaultTreeAdapter,
  parse as parseHtml,
  serialize,
  type DefaultTreeAdapterMap,
} from "parse5";
import type { Plugin } from "vite";

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

/** A module specifier (`preact`, `astro:transitions/client`), a package, or a chunk file pattern. */
export type ModuleSelector = string | { package: string } | { chunk: RegExp };

export interface ModuleHints {
  preload?: ModuleSelector[];
  prefetch?: ModuleSelector[];
}

export interface RouteHints extends ModuleHints {
  /** Matched against the page path, for example `/en/admin/events/view/checkin/`. */
  match: RegExp;
}

export interface ModulePreloadOptions {
  global?: ModuleHints;
  routes?: RouteHints[];
  /** Preload eager island modules and their static imports. Default true. */
  islands?: boolean;
  /** Fail the build when a page's modulepreload set exceeds this many gzip bytes. */
  budget?: number;
}

/** Built chunk file names for each selector, filled in by the client build. */
type SelectorIndex = Map<ModuleSelector, string[]>;

interface ChunkInfo {
  fileName: string;
  moduleIds: string[];
  imports: string[];
}

function selectorLabel(selector: ModuleSelector): string {
  if (typeof selector === "string") {
    return selector;
  }

  return "package" in selector ? `package ${selector.package}` : `chunk ${String(selector.chunk)}`;
}

function packagePattern(name: string): string {
  return `/node_modules/${name}/`;
}

/** Chunk files matched by a selector, including their static imports. */
export function matchChunks(
  chunks: ChunkInfo[],
  selector: ModuleSelector,
  resolvedId: string | null,
): string[] {
  const matches = chunks.filter((chunk) => {
    if (typeof selector !== "string") {
      return "chunk" in selector
        ? selector.chunk.test(chunk.fileName)
        : chunk.moduleIds.some((id) => id.includes(packagePattern(selector.package)));
    }

    return resolvedId !== null && chunk.moduleIds.includes(resolvedId);
  });
  const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const files = new Set<string>();
  const visit = (fileName: string): void => {
    if (files.has(fileName)) {
      return;
    }

    files.add(fileName);
    for (const dependency of byName.get(fileName)?.imports ?? []) {
      visit(dependency);
    }
  };

  for (const chunk of matches) {
    visit(chunk.fileName);
  }

  return [...files];
}

function allSelectors(options: ModulePreloadOptions): ModuleSelector[] {
  const hints = [options.global ?? {}, ...(options.routes ?? [])];
  const preload = hints.flatMap((hint) => hint.preload ?? []);
  const prefetch = hints.flatMap((hint) => hint.prefetch ?? []);

  return [...preload, ...prefetch];
}

function selectorPlugin(selectors: ModuleSelector[], index: SelectorIndex): Plugin {
  return {
    name: "module-preloads:selectors",
    applyToEnvironment: (environment) => environment.name === "client",
    async generateBundle(_output, bundle) {
      const chunks = Object.values(bundle).flatMap((item) =>
        item.type === "chunk"
          ? [{ fileName: item.fileName, moduleIds: item.moduleIds, imports: item.imports }]
          : [],
      );

      const resolved = await Promise.all(
        selectors.map(async (selector) => {
          const result = typeof selector === "string" ? await this.resolve(selector) : null;
          return result?.id ?? null;
        }),
      );

      for (const [position, selector] of selectors.entries()) {
        const files = matchChunks(chunks, selector, resolved[position] ?? null);

        if (files.length === 0) {
          this.error(`module-preloads: ${selectorLabel(selector)} matched no client chunk`);
        }

        index.set(selector, files);
      }
    },
  };
}

function hrefs(selectors: ModuleSelector[] | undefined, index: SelectorIndex): string[] {
  return (selectors ?? []).flatMap((selector) =>
    (index.get(selector) ?? []).map((file) => `/${file}`),
  );
}

/** Configured preload and prefetch hrefs for one page path. */
export function configuredHints(
  path: string,
  options: ModulePreloadOptions,
  index: SelectorIndex,
): { preload: string[]; prefetch: string[] } {
  const hints = [
    options.global ?? {},
    ...(options.routes ?? []).filter((route) => route.match.test(path)),
  ];

  return {
    preload: hints.flatMap((hint) => hrefs(hint.preload, index)),
    prefetch: hints.flatMap((hint) => hrefs(hint.prefetch, index)),
  };
}

function appendLink(head: Element, rel: string, href: string): void {
  const link = defaultTreeAdapter.createElement("link", HTML_NAMESPACE, [
    { name: "rel", value: rel },
    { name: "href", value: href },
  ]);

  defaultTreeAdapter.appendChild(head, link);
}

async function gzipSize(hrefList: string[], root: URL): Promise<number> {
  const sizes = await Promise.all(
    hrefList.map(async (href) => {
      const source = await readFile(new URL(href.slice(1), root));
      return gzipSync(source).byteLength;
    }),
  );

  return sizes.reduce((total, size) => total + size, 0);
}

interface PageContext {
  path: string;
  options: ModulePreloadOptions;
  index: SelectorIndex;
}

async function withModulePreloads(html: string, root: URL, page: PageContext): Promise<string> {
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

    if (
      page.options.islands !== false &&
      element.tagName === "astro-island" &&
      attribute(element, "client") === "load"
    ) {
      for (const name of ["component-url", "renderer-url"]) {
        const entry = scriptUrl(element, name, root);

        if (entry !== null) {
          islandEntries.push(entry);
        }
      }
    }

    const rel = attribute(element, "rel");

    if (element.tagName === "link" && (rel === MODULE_PRELOAD || rel === "prefetch")) {
      const href = attribute(element, "href");

      if (href !== undefined) {
        existing.add(href);
      }
    }
  });

  const head = heads[0];

  if (head === undefined) {
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

  const configured = configuredHints(page.path, page.options, page.index);
  const entryHrefs = new Set(scriptEntries.map((entry) => publicPath(entry, root)));
  const preloads = new Set(
    [
      ...[...dependencies].map((href) => publicPath(new URL(href), root)),
      ...configured.preload,
    ].filter((href) => !existing.has(href) && !entryHrefs.has(href)),
  );
  // Preload wins: a module already preloaded is never also prefetched.
  const prefetches = new Set(
    configured.prefetch.filter(
      (href) => !existing.has(href) && !entryHrefs.has(href) && !preloads.has(href),
    ),
  );

  if (preloads.size === 0 && prefetches.size === 0) {
    return html;
  }

  if (page.options.budget !== undefined) {
    const size = await gzipSize([...preloads], root);

    if (size > page.options.budget) {
      throw new Error(
        `module-preloads: ${page.path} preloads ${size} gzip bytes, budget is ${page.options.budget}`,
      );
    }
  }

  for (const href of [...preloads].toSorted()) {
    appendLink(head, MODULE_PRELOAD, href);
  }

  for (const href of [...prefetches].toSorted()) {
    appendLink(head, "prefetch", href);
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

function pagePath(file: URL, root: URL): string {
  const path = publicPath(file, root);

  return path.endsWith("/index.html") ? path.slice(0, -"index.html".length) : path;
}

/**
 * Add build-time modulepreload hints for entry scripts and eager Astro islands,
 * plus configured global and per-route preload/prefetch modules.
 */
export function modulePreloads(options: ModulePreloadOptions = {}): AstroIntegration {
  const index: SelectorIndex = new Map();

  return {
    name: "module-preloads",
    hooks: {
      "astro:config:setup": ({ command, updateConfig }) => {
        if (command === "build") {
          updateConfig({ vite: { plugins: [selectorPlugin(allSelectors(options), index)] } });
        }
      },
      "astro:build:done": async ({ dir }) => {
        const files = await htmlFiles(dir);

        await Promise.all(
          files.map(async (file) => {
            const html = await readFile(file, "utf8");
            const page = { path: pagePath(file, dir), options, index };
            const result = await withModulePreloads(html, dir, page);

            if (result !== html) {
              await writeFile(file, result);
            }
          }),
        );
      },
    },
  };
}
