// @boundary shared
declare global {
  interface HonoEnv {
    Bindings: Env;
  }

  /** Better Auth base URL injected by the `better-auth-url` integration. */
  // oxlint-disable-next-line eslint/no-underscore-dangle -- injected build-time global name.
  const __BETTER_AUTH_BASE_URL_CONFIG__:
    | string
    | {
        allowedHosts: string[];
        protocol: "auto" | "http" | "https";
        fallback?: string;
      };
}

// oxlint-disable-next-line unicorn/require-module-specifiers -- keeps this declaration file a module for `declare global`.
export {};
