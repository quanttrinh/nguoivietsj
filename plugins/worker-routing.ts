import type { AstroIntegration } from "astro";
import type { Plugin } from "vite";

type RoutesResolvedOptions = Parameters<
  NonNullable<AstroIntegration["hooks"]["astro:routes:resolved"]>
>[0];
type ResolvedRoute = RoutesResolvedOptions["routes"][number];

interface GeneratedWranglerConfig {
  assets?: {
    run_worker_first?: string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** Convert Astro's parsed route segments into a Cloudflare `run_worker_first` glob. */
function toWorkerPattern(segments: ResolvedRoute["segments"]): string {
  if (segments.length === 0) {
    return "/*";
  }

  const path = segments
    .map((parts) => parts.map((part) => (part.dynamic ? "*" : part.content)).join(""))
    .join("/");

  return path.endsWith("*") ? `/${path}` : `/${path}*`;
}

/** Remove patterns already covered by a shorter Worker-first glob. */
function compressPatterns(patterns: string[]): string[] {
  const unique = [...new Set(patterns)].toSorted((left, right) => left.length - right.length);
  const kept: string[] = [];

  for (const pattern of unique) {
    const covered = kept.some((candidate) => pattern.startsWith(candidate.slice(0, -1)));

    if (!covered) {
      kept.push(pattern);
    }
  }

  return kept.toSorted();
}

/** Build Worker-first patterns from the routes Astro resolved as on-demand. */
function workerPatterns(routes: ResolvedRoute[]): string[] {
  return compressPatterns(
    routes
      .filter(
        (route) => !route.isPrerendered && (route.type === "page" || route.type === "endpoint"),
      )
      .map((route) => toWorkerPattern(route.segments)),
  );
}

function patchWranglerAsset(asset: { source: string | Uint8Array }, patterns: string[]): void {
  const source =
    typeof asset.source === "string" ? asset.source : new TextDecoder().decode(asset.source);
  const config = JSON.parse(source) as GeneratedWranglerConfig;

  config.assets = {
    ...config.assets,
    run_worker_first: patterns,
  };

  asset.source = `${JSON.stringify(config, null, 2)}\n`;
}

/**
 * Keep Cloudflare's static-asset routing aligned with Astro's static/SSR split.
 *
 * The Cloudflare Vite plugin emits `wrangler.json` during `generateBundle`.
 * This post-order plugin mutates that emitted asset before Vite writes it, so
 * there is no read-modify-write pass over `dist/server/wrangler.json`.
 */
export function workerRouting(): AstroIntegration {
  let patterns: string[] = [];

  const outputPlugin: Plugin = {
    name: "worker-routing-output",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type === "asset" && output.fileName === "wrangler.json") {
          patchWranglerAsset(output, patterns);
        }
      }
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
        patterns = workerPatterns(routes);
      },
    },
  };
}
