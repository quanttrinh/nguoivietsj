// @boundary shared
declare global {
  interface HonoEnv {
    Bindings: Env;
  }

  /** Public origin of the active Worker, injected at build time. */
  // oxlint-disable-next-line eslint/no-underscore-dangle -- injected build-time global name.
  const __WORKER_ORIGIN__: string;
}

// oxlint-disable-next-line unicorn/require-module-specifiers -- keeps this declaration file a module for `declare global`.
export {};
