# Testing

Vitest runs three projects:

- `unit` — pure modules in Node (`tests/unit/`, mirroring the source tree)
- `integration` — the Hono app against a real Miniflare D1 database and seeded Better Auth sessions (`tests/integration/`)
- `browser` — Preact components in headless Chromium via Playwright (`tests/browser/`)

```sh
bun run test
bunx vitest run --project unit   # or integration / browser
```

Browser tests need `bunx playwright install chromium` once locally.

## Coverage and reports

`bun run test:coverage` runs `unit` + `integration` with V8 coverage over server
modules. Statements, functions, and lines must be 100%; branches at least 95%.
CI also publishes a **Vitest** check run with per-test annotations and uploads a
**vitest-reports** artifact (open `html/index.html`).

## Fuzzing and security tests

`tests/integration/api/fuzz/` property-tests every API endpoint with
`@fast-check/vitest`: hostile paths, bodies, queries, and headers are checked for
a valid response envelope, no 5xx, and no database mutation on rejection.
Failures report a replayable seed; `FUZZ_RUNS` overrides the default of 20.

`tests/integration/api/security/` verifies secure headers, CSRF, session/cookie
behavior, injection resistance, and abuse throttling (Turnstile, rate limiters,
OTP brute-force protection) against real D1/KV state.

## Verification

```sh
bun run auth:schema
bun run db:migrations:app
bun run db:migrations:events
git diff --exit-code -- drizzle src/db/app/schemas/auth-schema.ts
bun run test
bun run check
bun run lint
bun run fmt:check
bunx astro build
```

CI checks migration drift, runs affected test projects on PRs (full suite on
`main`), type checks, lints (including the boundary plugin), checks formatting,
and builds the Worker. The integration project applies all migrations to a fresh
Miniflare D1, compares the schema with the Drizzle definitions, and seeds fixtures.
