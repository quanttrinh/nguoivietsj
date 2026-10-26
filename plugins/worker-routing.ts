/* oxlint-disable typescript/no-unsafe-type-assertion -- Wrangler configuration is read at this build-tool boundary. */
import { type AstroIntegration } from "astro";
import { type Plugin } from "vite";

type RoutesResolvedOptions = Parameters<
  NonNullable<AstroIntegration["hooks"]["astro:routes:resolved"]>
>[0];

type ResolvedRoute = RoutesResolvedOptions["routes"][number];

/**
 * Structural type compatible with Hono's registered route metadata.
 *
 * This avoids requiring Hono as a dependency of the integration itself.
 */
interface HonoRouteSource {
  readonly routes: readonly {
    readonly path: string;
  }[];
}

export interface WorkerRoutingOptions {
  /** Filename of the Wrangler config emitted by the build. */
  wranglerConfigFile: string;

  hono?: HonoRouteSource;

  include?: readonly string[];

  mapHonoPath?: (path: string) => readonly string[] | undefined;
}

interface GeneratedWranglerConfig {
  assets?: {
    run_worker_first?: boolean | string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface WranglerAsset {
  source: string | Uint8Array;
}

function uniqueSorted(patterns: readonly string[]): string[] {
  return [...new Set(patterns)].toSorted();
}

/**
 * Include both common forms for a literal page/endpoint path.
 *
 * The actual router remains responsible for redirects and whether each
 * form is valid.
 */
function literalPathPatterns(path: string): string[] {
  if (path === "/") {
    return ["/"];
  }

  const withoutTrailingSlash = path.replace(/\/+$/u, "");

  return [withoutTrailingSlash, `${withoutTrailingSlash}/`];
}

/**
 * Generate conservative patterns from Astro's parsed segments.
 *
 * Fully literal routes get exact paths instead of broad "/path*" globs.
 *
 * For dynamic routes, retain the literal prefix up to the first dynamic
 * part and use a wildcard for everything after it. This deliberately
 * overmatches rather than attempting to translate optional/rest routes.
 */
function astroRoutePatterns(segments: ResolvedRoute["segments"]): string[] {
  if (segments.length === 0) {
    return ["/"];
  }

  let prefix = "";

  for (const parts of segments) {
    prefix += "/";

    for (const part of parts) {
      if (part.dynamic) {
        return [`${prefix}*`];
      }

      prefix += part.content;
    }
  }

  return literalPathPatterns(prefix);
}

function astroWorkerPatterns(routes: ResolvedRoute[]): string[] {
  return uniqueSorted(
    routes
      .filter(
        (route) => !route.isPrerendered && (route.type === "page" || route.type === "endpoint"),
      )
      .flatMap((route) => astroRoutePatterns(route.segments)),
  );
}

/**
 * Validate the basic shape of an explicit Cloudflare pattern.
 *
 * Cloudflare remains responsible for validating its complete pattern
 * syntax. Negated patterns are preserved rather than interpreted here.
 */
function validatePattern(pattern: string): void {
  const path = pattern.startsWith("!") ? pattern.slice(1) : pattern;

  if (!path.startsWith("/")) {
    throw new Error(
      `[worker-routing] Invalid Worker-first pattern: ` +
        `${JSON.stringify(pattern)}. Expected a path beginning with "/".`,
    );
  }
}

/**
 * Translate a deliberately limited subset of Hono syntax.
 *
 * Supported:
 *   /api/health
 *   /api/users/:id
 *   /api/*
 *
 * Parameter globs are conservative: Cloudflare may send extra requests
 * to the Worker, where Hono performs the authoritative route match.
 */
function defaultHonoPathPatterns(path: string): string[] {
  if (path === "*" || path === "/*") {
    throw new Error(
      "[worker-routing] A global Hono route was discovered. " +
        "Pass a dedicated backend/protected-route router, not the outer " +
        "app containing global middleware or the Astro/assets fallback. " +
        "If global Worker execution is intentional, configure it explicitly.",
    );
  }

  if (!path.startsWith("/")) {
    throw new Error(`[worker-routing] Hono route must start with "/": ${path}`);
  }

  const converted: string[] = [];

  for (const segment of path.split("/")) {
    if (segment === "" || segment === "*" || /^[A-Za-z0-9._~%+-]+$/u.test(segment)) {
      converted.push(segment);
    } else if (/^:[A-Za-z0-9_]+$/u.test(segment)) {
      converted.push("*");
    } else {
      throw new Error(
        `[worker-routing] Cannot automatically convert Hono path ` +
          `${JSON.stringify(path)}. Use mapHonoPath to provide an explicit ` +
          "Cloudflare pattern for optional parameters, regular expressions, " +
          "or other advanced syntax.",
      );
    }
  }

  return [converted.join("/")];
}

function honoWorkerPatterns(options: WorkerRoutingOptions): string[] {
  const app = options.hono;

  if (!app) {
    return [];
  }

  return uniqueSorted(
    app.routes.flatMap(({ path }) => options.mapHonoPath?.(path) ?? defaultHonoPathPatterns(path)),
  );
}

/**
 * Extend existing generated routing settings.
 *
 * - true remains true.
 * - Existing arrays, including exclusions, are retained.
 * - false/undefined are extended with the discovered patterns.
 *
 * Do not apply prefix-based glob compression: it is not generally valid
 * for internal wildcards, exact paths, or exclusions.
 */
function patchWranglerAsset(asset: WranglerAsset, patterns: readonly string[]): void {
  const source =
    typeof asset.source === "string" ? asset.source : new TextDecoder().decode(asset.source);

  const config = JSON.parse(source) as GeneratedWranglerConfig;
  const existing = config.assets?.run_worker_first;

  if (
    existing !== undefined &&
    typeof existing !== "boolean" &&
    (!Array.isArray(existing) || !existing.every((pattern) => typeof pattern === "string"))
  ) {
    throw new Error(
      "[worker-routing] Unexpected assets.run_worker_first value in the generated Wrangler config.",
    );
  }

  // `/*` already sends every request through the Worker, so adding specific
  // patterns would only create Wrangler "redundant route" errors.
  let merged: string[] | true;

  if (existing === true) {
    merged = true;
  } else {
    merged = uniqueSorted([...(Array.isArray(existing) ? existing : []), ...patterns]);

    // A root catch-all already sends every request through the Worker. Keep it
    // (and any exclusions) instead of emitting redundant specific patterns.
    if (merged.includes("/*")) {
      merged = merged.filter((pattern) => pattern === "/*" || pattern.startsWith("!"));
    }
  }

  if (Array.isArray(merged)) {
    for (const pattern of merged) {
      validatePattern(pattern);
    }
  }

  config.assets = {
    ...config.assets,
    run_worker_first: merged,
  };

  asset.source = `${JSON.stringify(config, null, 2)}\n`;
}

/**
 * Align generated Cloudflare asset routing with:
 *
 * 1. Astro on-demand routes.
 * 2. Dedicated Hono routes.
 * 3. Explicit Worker-first patterns.
 * 4. Existing generated Wrangler settings.
 *
 * Uses the emitted-wrangler mutation mechanism from the original plugin.
 * Requires a build pipeline that emits the configured Wrangler file as a Vite/Rollup asset.
 */
export function workerRouting(options: WorkerRoutingOptions): AstroIntegration {
  let patterns: string[] = [];

  const outputPlugin: Plugin = {
    name: "worker-routing-output",
    apply: "build",
    enforce: "post",

    generateBundle: {
      order: "post",

      handler(_outputOptions, bundle) {
        for (const output of Object.values(bundle)) {
          if (output.type === "asset" && output.fileName === options.wranglerConfigFile) {
            patchWranglerAsset(output, patterns);
          }
        }
      },
    },
  };

  return {
    name: "worker-routing",

    hooks: {
      "astro:config:setup": ({ updateConfig }) => {
        updateConfig({
          vite: {
            plugins: [outputPlugin],
          },
        });
      },

      "astro:routes:resolved": ({ routes }) => {
        patterns = uniqueSorted([
          ...astroWorkerPatterns(routes),
          ...honoWorkerPatterns(options),
          ...(options.include ?? []),
        ]);

        for (const pattern of patterns) {
          validatePattern(pattern);
        }
      },
    },
  };
}
