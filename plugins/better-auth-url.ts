/* oxlint-disable typescript/no-unsafe-type-assertion -- Wrangler configuration is read at this build-tool boundary. */
import { readFileSync } from "node:fs";

import { type AstroIntegration } from "astro";
import { parse } from "jsonc-parser";

interface WranglerRoute {
  pattern?: string;
  custom_domain?: boolean;
  enabled?: boolean;
}

interface WranglerEnvironment {
  routes?: WranglerRoute[];
  route?: string | WranglerRoute;
}

interface WranglerConfig extends WranglerEnvironment {
  env?: Record<string, WranglerEnvironment>;
}

function routesFor(environment: WranglerEnvironment): WranglerRoute[] {
  if (environment.routes !== undefined && environment.routes.length > 0) {
    return environment.routes;
  }

  if (environment.route === undefined) {
    return [];
  }

  return typeof environment.route === "string"
    ? [{ pattern: environment.route }]
    : [environment.route];
}

function routeOrigin(route: WranglerRoute): string | null {
  if (route.custom_domain !== true || route.enabled === false || route.pattern === undefined) {
    return null;
  }

  const pattern = route.pattern.trim();

  if (pattern.length === 0 || pattern.includes("*")) {
    return null;
  }

  try {
    return new URL(pattern.includes("://") ? pattern : `https://${pattern}`).origin;
  } catch {
    return null;
  }
}

/**
 * Resolve the public origin from the Wrangler configuration.
 *
 * `CLOUDFLARE_ENV` is the same selector the Astro Cloudflare adapter uses at
 * build time, so the injected URL always matches the emitted Worker config.
 */
export function resolveWranglerOrigin(
  config: WranglerConfig,
  environmentName: string | undefined,
  configPath = "Wrangler configuration",
): string {
  const environment = environmentName === undefined ? config : config.env?.[environmentName];

  if (environment === undefined) {
    throw new Error(
      `[better-auth-url] No Wrangler environment "${environmentName}" in ${configPath}.`,
    );
  }

  for (const route of routesFor(environment)) {
    const origin = routeOrigin(route);

    if (origin !== null) {
      return origin;
    }
  }

  throw new Error(
    `[better-auth-url] No enabled custom-domain route in ${configPath} for ${
      environmentName ?? "the top-level environment"
    }.`,
  );
}

function readWranglerConfig(pathname: string): WranglerConfig {
  return parse(readFileSync(pathname, "utf8")) as WranglerConfig;
}

export interface BetterAuthUrlOptions {
  /** Path to the Wrangler configuration file used for build-time route discovery. */
  configPath: string;
  /** Local origin used by `astro dev`, `astro preview`, and non-build commands. */
  devOrigin?: string;
}

/**
 * Inject `__BETTER_AUTH_BASE_URL__` from the active Wrangler custom-domain
 * route instead of duplicating the URL in every environment's `vars`.
 */
export function betterAuthUrl(options: BetterAuthUrlOptions): AstroIntegration {
  return {
    name: "better-auth-url",
    hooks: {
      "astro:config:setup": ({ command, config, updateConfig }) => {
        const devOrigin = options.devOrigin ?? `http://localhost:${config.server.port}`;
        const origin =
          command === "build"
            ? resolveWranglerOrigin(
                readWranglerConfig(options.configPath),
                process.env.CLOUDFLARE_ENV,
                options.configPath,
              )
            : devOrigin;

        updateConfig({
          vite: {
            define: {
              __BETTER_AUTH_BASE_URL__: JSON.stringify(origin),
            },
          },
        });
      },
    },
  };
}
