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
  return JSON.parse(readFileSync(pathname, "utf8")) as WranglerConfig;
}

export type AuthBaseUrl =
  | string
  | {
      allowedHosts: string[];
      protocol: "auto" | "http" | "https";
      fallback?: string;
    };

export interface ResolveAuthBaseUrlInput {
  command: "dev" | "build" | "preview" | "sync";
  preview?: boolean;
  serverPort: number;
  productionOrigin: string;
  devOrigin?: string;
}

function localAllowedHosts(port: number): string[] {
  return [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`];
}

/**
 * Pick the injected Better Auth base URL.
 *
 * Production and staging builds are fixed to the Wrangler custom domain.
 * Development and preview builds accept loopback hosts so local sign-in works
 * on localhost, 127.0.0.1, or IPv6 while retaining a non-local fallback.
 */
export function resolveAuthBaseUrl(input: ResolveAuthBaseUrlInput): AuthBaseUrl {
  const localOrigin = input.devOrigin ?? `http://localhost:${input.serverPort}`;
  const isPreviewBuild = input.command === "build" && input.preview === true;
  const isDevelopment = input.command === "dev";

  if (isDevelopment || isPreviewBuild) {
    return {
      allowedHosts: localAllowedHosts(input.serverPort),
      protocol: "auto",
      fallback: isDevelopment ? localOrigin : input.productionOrigin,
    };
  }

  if (input.command === "build") {
    return input.productionOrigin;
  }

  return localOrigin;
}

export interface BetterAuthUrlOptions {
  /** Path to the Wrangler configuration file used for build-time route discovery. */
  configPath: string;
  /** Local origin used by `astro dev`, `astro preview`, and non-build commands. */
  devOrigin?: string;
}

function authBaseUrlPlugin(input: {
  command: "dev" | "build" | "preview" | "sync";
  serverPort: number;
  productionOrigin: string;
  devOrigin?: string;
}): Plugin {
  return {
    name: "better-auth-url:base-url",
    config(_config, env) {
      const baseURL = resolveAuthBaseUrl({
        ...input,
        preview: env.mode === "preview",
      });

      return {
        define: {
          __BETTER_AUTH_BASE_URL_CONFIG__: JSON.stringify(baseURL),
        },
      };
    },
  };
}

/**
 * Inject `__BETTER_AUTH_BASE_URL_CONFIG__` from the active Wrangler custom-domain
 * route instead of duplicating the URL in every environment's `vars`.
 */
export function betterAuthUrl(options: BetterAuthUrlOptions): AstroIntegration {
  return {
    name: "better-auth-url",
    hooks: {
      "astro:config:setup": ({ command, config, updateConfig }) => {
        const productionOrigin =
          command === "build"
            ? resolveWranglerOrigin(
                readWranglerConfig(options.configPath),
                process.env.CLOUDFLARE_ENV,
                options.configPath,
              )
            : `http://localhost:${config.server.port}`;
        updateConfig({
          vite: {
            plugins: [
              authBaseUrlPlugin({
                command,
                serverPort: config.server.port,
                productionOrigin,
                ...(options.devOrigin === undefined ? {} : { devOrigin: options.devOrigin }),
              }),
            ],
          },
        });
      },
    },
  };
}
