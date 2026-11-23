/* oxlint-disable typescript/no-unsafe-type-assertion -- Wrangler configuration is read at this build-tool boundary. */
import { readFileSync } from "node:fs";

import type { AstroIntegration } from "astro";
import type { Plugin } from "vite";

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
    ? [{ pattern: environment.route, custom_domain: true }]
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
 */
export function resolveWranglerOrigin(
  config: WranglerConfig,
  environmentName: string | undefined,
  configPath = "Wrangler configuration",
): string {
  const environment = environmentName === undefined ? config : config.env?.[environmentName];

  if (environment === undefined) {
    throw new Error(
      `[worker-origin] No Wrangler environment "${environmentName}" in ${configPath}.`,
    );
  }

  for (const route of routesFor(environment)) {
    const origin = routeOrigin(route);

    if (origin !== null) {
      return origin;
    }
  }

  throw new Error(
    `[worker-origin] No enabled custom-domain route in ${configPath} for ${
      environmentName ?? "the top-level environment"
    }.`,
  );
}

function readWranglerConfig(pathname: string): WranglerConfig {
  return JSON.parse(readFileSync(pathname, "utf8")) as WranglerConfig;
}

/** Pick the public origin to inject at build time. */
export function resolveWorkerOrigin(input: {
  command: "dev" | "build" | "preview" | "sync";
  preview: boolean;
  serverPort: number;
  productionOrigin: string;
}): string {
  if (input.command === "build" && !input.preview) {
    return input.productionOrigin;
  }

  // Development, sync, preview, and preview builds all run locally. The runtime
  // helper derives its loopback fallback from this origin.
  return `http://localhost:${input.serverPort}`;
}

function workerOriginPlugin(input: {
  command: "dev" | "build" | "preview" | "sync";
  serverPort: number;
  productionOrigin: string;
}): Plugin {
  return {
    name: "worker-origin:inject",
    config(_config, env) {
      return {
        define: {
          __WORKER_ORIGIN__: JSON.stringify(
            resolveWorkerOrigin({ ...input, preview: env.mode === "preview" }),
          ),
        },
      };
    },
  };
}

/**
 * Inject `__WORKER_ORIGIN__` from the active Wrangler custom-domain route
 * instead of duplicating the URL in every environment's `vars`.
 */
export function workerOrigin(options: { configPath: string }): AstroIntegration {
  return {
    name: "worker-origin",
    hooks: {
      "astro:config:setup": ({ command, config, updateConfig }) => {
        const productionOrigin =
          command === "build"
            ? resolveWranglerOrigin(
                readWranglerConfig(options.configPath),
                process.env.WORKER_ORIGIN_ENV ?? process.env.CLOUDFLARE_ENV,
                options.configPath,
              )
            : `http://localhost:${config.server.port}`;
        updateConfig({
          vite: {
            plugins: [
              workerOriginPlugin({
                command,
                serverPort: config.server.port,
                productionOrigin,
              }),
            ],
          },
        });
      },
    },
  };
}
