# Người Việt SJ

Community events and registration for the Vietnamese community in Saint John,
hosted on Cloudflare Workers. Supports multiple events, ticket types, custom
forms, manual payments, QR check-in, and staff tools.

## Quick start

Requirements: Bun, Node.js, Doppler CLI, and Wrangler. Bun, Node.js, Doppler,
and OpenTofu are pinned with [aqua](https://aquaproj.github.io/) in
`aqua/aqua.yaml` and used by CI and the devcontainer.

```sh
doppler login
doppler setup
doppler run -- bun install
bun run db:migrate
bun run db:seed
bun run dev
```

Seeded local accounts: `admin@example.com`, `staff@example.com`. Sign in by
requesting a one-time code sent to your email. Event list:
`http://localhost:4321/en/events/`.

`bun install` generates Panda CSS and Wrangler types; `doppler run -- bun install`
also supplies the GitHub Packages token.

## Common commands

| Command                                  | Purpose                              |
| ---------------------------------------- | ------------------------------------ |
| `bun run dev`                            | Local dev server (Astro via Doppler) |
| `bun run check`                          | Astro/TypeScript diagnostics         |
| `bun run lint` / `bun run fmt:check`     | Lint / format check                  |
| `bun run test`                           | Unit, integration, and browser tests |
| `bun run db:migrate` / `bun run db:seed` | Local database setup                 |
| `bun manage.ts list`                     | Operational backfills                |

Mailtrap email templates are managed by the [Mailtrap OpenTofu root](./infra/mailtrap/README.md)
from `infra/mailtrap/templates/`; do not edit them in the Mailtrap UI.

## Documentation

- [Getting started](./docs/getting-started.md) — setup, environment variables, local URLs
- [Cloudflare infrastructure](./infra/cloudflare/README.md) — OpenTofu Cloudflare resources and generated config
- [Mailtrap infrastructure](./infra/mailtrap/README.md) — email templates managed by OpenTofu
- [Backfills](./docs/backfills.md) — manage CLI and workflows
- [Testing](./docs/testing.md) — test projects, coverage, CI

## License

GPL-3.0-only © 2026 Quan Trinh. See [LICENSE](./LICENSE).
