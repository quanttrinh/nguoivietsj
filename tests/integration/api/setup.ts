// The Astro build injects this global; tests need the same shape.
Object.assign(globalThis, {
  __BETTER_AUTH_BASE_URL_CONFIG__: "http://localhost:4321",
});

// oxlint-disable-next-line unicorn/require-module-specifiers -- side-effect-only setup module.
export {};
