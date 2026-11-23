// Test-only hashing config for the CLI seed helper; never used in production.
process.env.AUTH_PASSWORD_CONFIG ??=
  '{"iterations":1000,"saltBytes":8,"keyBits":128,"prefix":"pbkdf2_test","pepper":"cGVwcGVyLXZhbHVlLTEyMzQ"}';

// The Astro build injects this global; tests need the same shape.
Object.assign(globalThis, {
  __WORKER_ORIGIN__: "http://localhost:4321",
});

/*
 * Hono's cache middleware decides at route-module load time whether caching is
 * available. Setup files run before every test module, so a shared miss-only
 * CacheStorage keeps public reads hitting D1 without leaking state across files.
 */
Reflect.set(globalThis, "caches", {
  open: () =>
    Promise.resolve({
      match: () => Promise.resolve(undefined),
      put: () => Promise.resolve(undefined),
    }),
});

// oxlint-disable-next-line unicorn/require-module-specifiers -- side-effect-only setup module.
export {};
