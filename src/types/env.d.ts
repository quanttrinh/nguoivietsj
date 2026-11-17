// @boundary shared
declare global {
  interface HonoEnv {
    Bindings: Env;
  }

  /** Public origin injected by the `better-auth-url` Astro integration. */
  // oxlint-disable-next-line eslint/no-underscore-dangle -- injected build-time global name.
  const __BETTER_AUTH_BASE_URL__: string;
}

// oxlint-disable-next-line unicorn/require-module-specifiers -- keeps this declaration file a module for `declare global`.
export {};
