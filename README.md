# Người Việt SJ

Community events and registration for the Vietnamese community in Saint John,
hosted on Cloudflare Workers.

The platform supports multiple events and editions, ticket types, predefined
contacts, custom fields, conditional sections, reusable form versions, manual
payment confirmation, QR check-in, and staff support tools.

## Stack

- Astro 7 with static pages, Cloudflare Worker endpoints, and Preact islands
- Cloudflare Workers, D1, Queues, Workers Cache, Rate Limiting, and Turnstile
- Better Auth for staff/admin authentication
- Cloudflare Access for the whole staging website only
- Drizzle ORM and Drizzle Kit for the two D1 databases
- TypeBox for API and form-schema validation
- Effect for selected server-side workflows
- Intlayer for localized content
- Qui and PandaCSS for form controls and page styling

## Requirements

- Bun 1.4.4
- Node.js 24
- Doppler CLI
- OpenTofu 1.13.9 or newer for infrastructure changes
- Wrangler
- A Cloudflare account for deployment

## Tool pins

Bun, Node.js, Doppler CLI, and OpenTofu are managed by
[aqua](https://aquaproj.github.io/). Versions live in `aqua/aqua.yaml`; the local
Doppler registry entry lives in `aqua/registry.yaml`. CI and the devcontainer
install the same pinned, checksum-verified releases from that manifest. The
workflows use `.github/actions/setup-deps`, which also caches the aqua tools and
Bun's package cache.

## Local development

Local values are stored in Doppler. The repository's `doppler.yaml` selects the
`web` project and `dev_personal` config:

```sh
doppler login
doppler setup
doppler run -- bun install
bun run db:smoke
bun run dev
```

`bun run dev` runs Astro through `doppler run`, so the Turnstile, email,
Better Auth, and GitHub Packages values come from Doppler. Public Worker
variables stay in `wrangler.json` and do not need local overrides.

`doppler run -- bun install` supplies `NODE_AUTH_TOKEN` for GitHub Packages.
`bun run dev` requires the Doppler setup step to have been run in this
directory.

`bun install` runs Panda codegen and `wrangler types`. The generated
`src/types/worker-configuration.d.ts` file is intentionally ignored by git.

`bun run db:seed` recreates local test events, forms, registrations,
payments, check-ins, status links, and the local users:

- `admin@example.com` — admin
- `staff@example.com` — staff
- password: `dev-password`

### Cloudflare Web Analytics

Set `PUBLIC_CLOUDFLARE_ANALYTICS_TOKEN` in Doppler to the Web Analytics site
token. Leaving it empty keeps the analytics beacon out of the build. Cloudflare
Web Analytics reports page views, referrers, and Core Web Vitals; it does not
capture JavaScript exceptions. Use Sentry or Workers Logs for frontend/backend
error tracking.

Useful local URLs:

- Public event list: `http://localhost:4321/en/events/`
- Public registration: `http://localhost:4321/en/events/registration?slug=summer-picnic-2027`
- Admin catalog: `http://localhost:4321/en/admin/events`

The development staff fallback is compiled behind `import.meta.env.DEV` and
does not run in production or staging.

## Commands

```sh
bun run dev              # local Astro dev server through Doppler
bunx astro build         # production build
CLOUDFLARE_ENV=staging bunx astro build # staging build
bun run preview          # preview the built worker
bun run check            # Astro type/diagnostic check
bun run typecheck        # check + oxlint + oxfmt check
bun run lint             # oxlint + client/server boundary check
bun run lint:fix         # oxlint --fix
bun run fmt              # oxfmt
bun run fmt:check        # oxfmt --check
bun run test             # Vitest tests
```

Local database commands:

```sh
bun run db:migrate --target local
bun manage.ts migrate --target local -- --database events
bun run db:seed
bun run db:check
```

Staging and production migrations are applied by the Deploy workflow. Use
`bun manage.ts` directly only for operational tasks such as `optimize`,
`backfill`, or `create-user`; those commands default to `--target local`.
Database selection is `app`, `events`, or `all`. Seed data is local-only.

## Backfills

Every task in the manage CLI is a backfill under `src/backfills/<name>/index.ts`:

```ts
import { createD1Context } from "#tooling/d1/d1";
import { defineBackfill } from "#tooling/manage/backfill";

export default defineBackfill({
  description: "What this does.",
  usage: "bun manage.ts backfill example -- <args>",
  run: async (context, args) => {
    // D1 is opt-in; the manager core has no database dependency.
    const db = createD1Context(context.target, context.dryRun, context.log);
    // Import your own Drizzle schema/ORM here.
    await db.database.execute("events", "SELECT 1");
  },
});
```

Discover and run them:

```sh
bun manage.ts list
bun manage.ts help registration-stats
bun manage.ts backfill registration-stats --target staging --dry-run
bun manage.ts backfill registration-stats --target staging
```

Global options (`--target`, `--dry-run`, `--help`) go before `--`. Arguments
after `--` belong to the backfill:

```sh
bun manage.ts backfill create-user --target production -- admin@example.com --role admin
```

`seed`, `migrate`, `check`, `optimize`, and `create-user` are backfills too.
`bun manage.ts seed` is shorthand for `bun manage.ts backfill seed`.

The manager core only passes `target`, `dryRun`, and `log`. It does not import
D1 or Wrangler. Backfills that need database access opt in through
`createD1Context()` and import their own Drizzle schema/ORM. Wrangler's D1 CLI
cannot bind positional parameters, so queries are serialized with Drizzle's
built-in `inlineParams()`. Dry-run mode prints that SQL instead of executing it.

The manual **Backfill** GitHub Actions workflow accepts a backfill name or path,
a staging/production target, a JSON argument array, and a dry-run flag:

```sh
gh workflow run backfill.yml \
  -f backfill=registration-stats \
  -f target=staging \
  -f 'args=["--database","events"]' \
  -f dry_run=true
```

## Environment variables

Local development reads values from the Doppler `dev_personal` config. Deploys
read the same names from the `stg` and `prd` configs. Public Worker variables
are committed in `wrangler.json`; the generated Turnstile site key and all
secrets are supplied from Doppler.

| Variable                   | Purpose                                               |
| -------------------------- | ----------------------------------------------------- |
| `NODE_AUTH_TOKEN`          | GitHub Packages token used by `.npmrc` during install |
| `TURNSTILE_SITE_KEY`       | Public Turnstile site key, generated by OpenTofu      |
| `TURNSTILE_SCRIPT_URL`     | Turnstile script URL                                  |
| `TURNSTILE_VERIFY_URL`     | Turnstile server verification URL                     |
| `TURNSTILE_ALLOW_TEST_KEY` | Allows Cloudflare test keys in non-production checks  |
| `TURNSTILE_SECRET`         | Turnstile secret, stored with Wrangler                |
| `BETTER_AUTH_SECRET`       | Better Auth signing secret, stored with Wrangler      |
| `EMAIL_PROVIDER`           | Active email provider: `gmail` or `mailtrap`          |
| `GMAIL_CLIENT_ID`          | Google OAuth client ID                                |
| `GMAIL_CLIENT_SECRET`      | Google OAuth client secret                            |
| `GMAIL_REFRESH_TOKEN`      | Gmail send-only refresh token                         |
| `GMAIL_SENDER_EMAIL`       | Gmail/Workspace sender or verified send-as alias      |
| `GMAIL_SENDER_NAME`        | Sender display name                                   |
| `GMAIL_TOKEN_URL`          | Google OAuth token endpoint                           |
| `GMAIL_SEND_URL`           | Gmail `messages.send` endpoint                        |
| `MAILTRAP_API_TOKEN`       | Optional Mailtrap fallback token                      |
| `MAILTRAP_API_URL`         | Mailtrap send endpoint                                |
| `MAILTRAP_FROM_EMAIL`      | Mailtrap verified sender address                      |
| `MAILTRAP_FROM_NAME`       | Mailtrap sender display name                          |

Secrets are `TURNSTILE_SECRET`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`,
`GMAIL_REFRESH_TOKEN`, and `BETTER_AUTH_SECRET`. The optional Mailtrap fallback
uses `MAILTRAP_API_TOKEN`. Everything else is a Worker variable or a local
development value.

See [`docs/gmail.md`](./docs/gmail.md) for Google Cloud, OAuth consent, sender
alias, and refresh-token setup.

The Better Auth base URL is not a Wrangler variable. The `better-auth-url`
Astro integration reads the enabled custom-domain route from `wrangler.json`
for the active `CLOUDFLARE_ENV` and injects it at build time. Local development
uses `http://localhost:4321` automatically.

Registration, payment, and status-OTP templates live in
`src/events/services/email/templates/`. The event email service renders them
locally into a complete message. Gmail sends that message as MIME; Mailtrap
sends the same subject, HTML, and text through its raw sending API. If the
active provider is not configured, the corresponding email is skipped while the
underlying registration or payment still succeeds.

## Architecture

```text
Astro page
  ├─ static shell and localized content
  ├─ Preact island (client:load) for page behavior
  └─ server endpoint under /api/events/...
        └─ Drizzle repository → D1
```

Public pages are static. APIs and admin mutations run in the Cloudflare Worker.
Preact islands handle the interactive status, admin, payment, support, QR, and
check-in pages. The registration form keeps a small vanilla runtime because it
coordinates Qui custom elements, conditional fields, Turnstile, and form
submission.

`src/shared` contains app-wide primitives and infrastructure only: locale/path
patterns, localization, roles, auth, email transport, Turnstile, security
headers, and client utilities. Event-engine contracts live under `src/events`:
cross-layer constants in `src/events/domain`, and server-only API problems,
parameters, responses, effects, and route decorators in
`src/events/server/api`.

### Client/server boundaries

The import graph is enforced by the `boundary/scopes` Oxlint rule in
`plugins/oxlint-boundary-plugin.ts`, which runs as part of `bun run lint`:

| Scope  | Paths                                                                    | May import                        |
| ------ | ------------------------------------------------------------------------ | --------------------------------- |
| Server | `server`, `db`, and `services` directory segments; root `src/*.ts` files | Server and shared                 |
| Client | `src/**/ui/**`, `src/shared/client`, `src/shared/ui`                     | Client, shared, and `~/types/api` |
| Astro  | `src/pages`, `src/layouts`                                               | Server, client, and shared        |
| Shared | domain, content, constants, utils, API types, auth policy                | Shared only                       |

Every source file starts with a boundary marker:

```ts
// @boundary server
```

Astro files put the same marker inside their frontmatter. Lint verifies that
the marker exists and matches the path convention above. The generated
`src/types/worker-configuration.d.ts` is exempt; these paths are configured in
`oxlint.config.ts` rather than baked into the rule.

Client code may reach server types only through `~/types/api`. Direct imports
from client modules into server/database modules, or server modules into client
UI, fail lint.

## Database

Two D1 databases are used:

- `APP_DB` — application identities and roles
- `EVENT_ENGINE_DB` — events, forms, registrations, contacts, tickets, answers,
  payments, check-ins, status sessions, and email delivery records

Migrations are managed by Drizzle Kit:

```sh
bun run db:generate:events        # generate event database migration
bun run db:generate:app            # generate app migration
bun run db:generate:events --custom # custom event database migration
bun run db:generate:app --custom   # custom app migration
```

Registration writes use one transactional D1 batch. Database triggers enforce
ticket limits and event/ticket-type capacity, so the service and the database
both check those constraints.

The daily scheduled Worker (`0 3 * * *`) also applies data retention. Once an
event's `endsAt` is more than three months old, it deletes the event's
registrations and their contacts, answers, tickets, check-ins, payments, phone
claims, status sessions/OTPs, search entries, and registration-linked audit
rows, then resets the event's aggregate counters. Events without an `endsAt`
are skipped because no retention window can be calculated. Expired status
sessions, OTPs older than 30 days, and email delivery records older than 90 days
are pruned separately.

`bun run codegen` regenerates `src/types/worker-configuration.d.ts`. The Hono
API contract lives in `src/types/api.d.ts`; no separate env-only declaration is
generated.

## Routes

### Public

| Route                                                | Purpose                             |
| ---------------------------------------------------- | ----------------------------------- |
| `/{locale}/events`                                   | Public event list                   |
| `/{locale}/events/registration?slug={slug}`          | Event details and registration form |
| `/{locale}/events/status`                            | Status recovery with email OTP      |
| `/{locale}/events/status/view?token={token}`         | Tokenized registration status page  |
| `/api/events`                                        | Public event list API               |
| `/api/events/{slug}`                                 | Public event detail and form API    |
| `/api/events/{slug}/registrations`                   | Registration submission             |
| `/api/events/{slug}/registrations/{id}/qr?token=...` | Tokenized check-in QR SVG           |
| `/api/events/status/request`                         | Request a status OTP                |
| `/api/events/status/verify`                          | Verify OTP and issue a token        |
| `/api/events/status/{token}`                         | Status page data                    |

### Staff pages

Staff and admin pages use Better Auth sessions. The `users.role` column decides
what an identity can do.

| Route                                                          | Purpose                   |
| -------------------------------------------------------------- | ------------------------- |
| `/{locale}/admin`                                              | Administration home       |
| `/{locale}/admin/users`                                        | User management           |
| `/{locale}/admin/events`                                       | Event catalog             |
| `/{locale}/admin/events/view?event={id}`                       | Event detail              |
| `/{locale}/admin/events/view/support?event={id}`               | Registration search       |
| `/{locale}/admin/events/view/activity?event={id}`              | Staff activity history    |
| `/{locale}/admin/events/view/checkin?event={id}`               | Camera or manual check-in |
| `/{locale}/admin/events/view/payments?event={id}`              | Payment confirmation      |
| `/{locale}/admin/events/view/qr?event={id}&registration={rid}` | Printable registration QR |

### Admin pages

Admin-only pages add:

- Create, edit, clone, and archive events
- Ticket type management
- Form version creation, editing, and preview
- Event settings, aliases, notes, and payment instructions

### Staff/admin APIs

| Route                                               | Purpose                    |
| --------------------------------------------------- | -------------------------- |
| `GET /api/admin/events`                             | List events                |
| `GET /api/admin/events/{id}`                        | Read event                 |
| `GET /api/admin/events/{id}/overview`               | Admin detail overview      |
| `GET /api/admin/events/{id}/registrations`          | List registrations         |
| `GET /api/admin/events/{id}/support`                | Search registrations       |
| `GET /api/admin/events/{id}/activity`               | Activity history           |
| `GET /api/admin/events/{id}/payments`               | Payment list               |
| `GET /api/admin/events/{id}/checkins`               | Check-in list              |
| `GET /api/admin/events/{id}/registrations/{rid}/qr` | Registration QR            |
| `POST /api/admin/events/{id}/checkins`              | Check in                   |
| `DELETE /api/admin/events/{id}/checkins/{rid}`      | Undo check-in              |
| `POST/DELETE /api/admin/events/{id}/payments/{rid}` | Confirm or remove payment  |
| `POST /api/admin/events/{id}/registrations`         | Admin-created registration |

Admin-only APIs also cover event create/update, ticket types, form versions, and
form previews.

API errors keep a stable `error` code and add a localized `message`. The locale
is resolved from `?locale=`, then `X-Locale`, then `Accept-Language`, and finally
falls back to `DEFAULT_LOCALE`.

## Authentication and security

Production and staging staff authenticate with Better Auth email/password
sessions stored in `AUTH_SESSION_KV`. The `users.role` column in `APP_DB` is the
authorization layer. Staging is also gated end-to-end by Cloudflare Access at
the edge; production is not.

- `requireAuth` loads the Better Auth session for protected APIs.
- `requireAdmin` allows only the `admin` role.
- `requireEventStaff` allows the `admin` and `event_staff` roles.
- `withSameOriginRoute` protects public mutations.
- Middleware validates locale prefixes, redirects locale-less paths, and applies
  security headers.
- Registration is also protected by Turnstile and a per-IP rate limiter.

Staff accounts are provisioned with `bun manage.ts backfill create-user -- <email>`; public sign-up is
disabled. Local development can use the seeded accounts.

### Two-factor authentication

Better Auth's `twoFactor` plugin adds a second sign-in step: an authenticator
app (TOTP), an emailed code, or a one-time backup code. Admin, `event_staff`,
and `event_checkin` accounts must enroll; until they do, `requireAuth` returns
`403 two_factor_required` and the admin pages send them to
`/{locale}/login/two-factor/`, which renders the QR code locally and shows the
backup codes once. Emailed codes go through `EMAIL_QUEUE`, are stored hashed,
expire after 3 minutes, and `/two-factor/send-otp` is limited to 3 requests per
minute. "Trust this device" skips the second step for 30 days.

To recover a staff member who lost their device and backup codes, an operator
with Wrangler access resets enrollment, then the user enrolls again at their
next sign-in:

```sh
bunx wrangler d1 execute nguoivietsj-db --remote --command \
  "DELETE FROM two_factor WHERE user_id = (SELECT id FROM user WHERE email = 'person@example.com'); \
   UPDATE user SET two_factor_enabled = 0 WHERE email = 'person@example.com';"
```

Use `--env staging` with `nguoivietsj-staging-db` for staging.

## Registration

Registration is schema-driven and copy-on-write by form version. Published
schemas are trusted at render time, while submissions are validated server-side
against the published schema before storage.

The service:

- Checks registration-open and event status
- Validates tickets, contacts, answers, and form version
- Checks duplicate email and name-plus-phone identity
- Enforces ticket limits and capacity
- Creates the registration, contacts, tickets, answers, status session, and
  counters in one D1 batch
- Returns the registration ID and tokenized status URL
- Queues the registration-received email

Hidden answers are omitted and never stored.

## Status recovery

Registrants normally receive a tokenized status link by email. If it is lost,
they can enter their registration ID and registration email at
`/{locale}/events/status`.

A six-digit code is sent by the active email provider and exchanged for a new status token. Codes:

- expire after 10 minutes
- allow five attempts
- can be requested again after 60 seconds

The status page shows payment state, tickets, amount due, check-in state, and a
QR code once payment is confirmed or no payment is required.

## Payments, check-in, and email

Cash and e-Transfer payments are confirmed manually from the staff payments page.
Confirming the first payment queues the payment email with the embedded check-in
QR and makes the QR available on the status page. Removing a payment hides the
QR and blocks new check-ins.

Check-in is available through camera scanning or manual registration ID entry.
Scans create a `checkins` row; duplicate scans return the original check-in time.
Staff can undo a mistaken check-in.

Registration, payment, and status-code emails use the shared `EMAIL_QUEUE`.
Gmail is the default sender through OAuth and local HTML/text templates.
Setting `EMAIL_PROVIDER=mailtrap` switches back to Mailtrap-hosted templates.
Jobs carry an idempotency key recorded in `email_deliveries`, so completed
messages are not sent again on retry. Failed messages retry and then move to the
environment's dead-letter queue.

The payment template embeds the QR through the `checkin-qr` content ID.

## Caching and routing

Every page is prerendered and served from static assets. The Worker runs only
for `/api/*` (`assets.run_worker_first` in `wrangler.json`), so page views do
not count against the Workers request or CPU limits.

The public event list is a static shell that loads `/api/events` in the
browser. Hashed files under `/_astro/*` are served with an immutable
`Cache-Control` header.

Admin, preview, mutation, and registration responses are never cached.

## Cloudflare infrastructure

Wrangler manages:

- the Worker, assets, routes, and custom domains
- D1, KV, and queue bindings
- rate-limit bindings
- Worker variables and secrets

OpenTofu under `infra/cloudflare/` manages:

- zone TLS/HTTPS and HSTS settings
- Turnstile widget
- WAF registration challenge
- rate-limiting rule
- the whole-website Cloudflare Access application for staging
- staging Access policies
- optional DNS records not owned by Wrangler
- D1, KV, and queue resources from `wrangler.json`

Production does not use Cloudflare Access; staff sign in through Better Auth.

The deploy workflow publishes the generated Turnstile site key and secret to
Doppler, then builds with `doppler run` so the site key is available to Astro.
D1 and KV bindings are declared in `wrangler.json` and read by Terraform. The
deploy workflow renders a generated Wrangler config with the resolved IDs.

See [`infra/cloudflare/README.md`](./infra/cloudflare/README.md) for token
permissions, Turnstile setup, staging Access policies, and state backend
details.

## Deployment

Deployment is manual through `.github/workflows/deploy.yml`. Staging deploys
`main` by default and can optionally deploy an open, same-repository PR.
Production deploys `main` only and should be protected by required reviewers on
the `production` GitHub environment. The workflow publishes the Turnstile site
key and secret to Doppler, pushes the required Worker secrets from Doppler,
applies D1 migrations, and deploys the Worker. It does not apply Terraform.

Infrastructure changes are planned on pull requests and applied from `main`
through `.github/workflows/infra.yml`. Staging deployments, including PR
deployments, never run `tofu apply`.

```sh
# Staging from main
gh workflow run deploy.yml -f environment=staging

# Staging from a PR
gh workflow run deploy.yml -f environment=staging -f pr=123

# Production from main
gh workflow run deploy.yml -f environment=production
```

Fork PRs are rejected because deploying them would expose staging secrets to
untrusted code.

GitHub Actions does not need a Cloudflare Tunnel. The Cloudflare API, Wrangler,
and the R2 state endpoint are all reachable over HTTPS with scoped API tokens.

Deployment and CI secrets are managed with [Doppler](https://www.doppler.com/).
The workflows use two Doppler service tokens stored in GitHub: a read-only
`DOPPLER_READ_TOKEN` for installs, plans, and deploys, and a read-write
`DOPPLER_WRITE_TOKEN` for publishing generated Turnstile values. Tokens are
step-scoped, and the CLI receives the active one as `DOPPLER_TOKEN`. See
[`infra/cloudflare/README.md`](./infra/cloudflare/README.md#doppler-setup) for
the required Doppler secrets and config layout.

For local infrastructure changes, either keep a gitignored
`infra/cloudflare/terraform.tfvars` or run commands through Doppler:

```sh
doppler run -c prd -- tofu -chdir=infra/cloudflare plan
```

For the Mailtrap fallback, set `EMAIL_PROVIDER=mailtrap` and configure the
Mailtrap token and sender.

To deploy:

1. Create the long-lived D1, KV, and queue resources once. See
   [One-time resource bootstrap](./infra/cloudflare/README.md#one-time-resource-bootstrap).
2. Apply infrastructure from `main` with the `Infrastructure` workflow, then run
   the `Deploy` workflow for `staging` or `production`. The deploy workflow
   publishes Turnstile values to Doppler, pushes Worker secrets, applies D1
   migrations, and deploys the Worker.
3. Verify the Gmail sender, send-as alias, and OAuth refresh token.

If you are using the Mailtrap fallback, set `EMAIL_PROVIDER=mailtrap` in
`wrangler.json` and configure `MAILTRAP_API_TOKEN`.

`CLOUDFLARE_ENV` selects the Wrangler environment during the Astro build. The
generated `.wrangler/deploy/config.json` already points at the staging Worker,
so `wrangler deploy` must not also pass `--env staging`.

Do not enable the WAF registration challenge until the Worker deployed with the
matching Turnstile widget and secret.

## Project layout

```text
manage.ts                    Dynamic backfill runner
doppler.yaml                 Local Doppler project/config selection
src/
  db/                       Drizzle schemas, ORM, and repositories
  events/
    domain/                 Event types, validation, form-schema logic
    server/                 Registration, cache, email, status, QR, rate limit
    content/                Intlayer dictionaries
    registration/           Preact form shell and vanilla form runtime
    status/                 Preact status pages
    admin/
      islands/              Remaining vanilla form/builder entrypoints
      ui/                   Preact admin pages and shared admin styles
  home/                     Home content and UI
  shared/
    client/                 Browser helpers and Preact hooks
    server/                 API, auth, email, middleware, Turnstile
    ui/                     Shared Astro components
    utils/                  Isomorphic helpers
  pages/
    [locale]/events/        Public, status, and admin pages
    api/events/             APIs outside the locale prefix
drizzle/
  app/                      APP_DB migrations
  events/                   EVENT_ENGINE_DB migrations
infra/cloudflare/           TLS, HSTS, WAF, Turnstile, DNS, Access, D1/KV discovery
docs/
  gmail.md                  Gmail API, OAuth, and sender setup
src/
  backfills/
    <name>/index.ts         Backfill command and description
    <name>/backfill.sql     Optional SQL used by the backfill
    seed/seed-events.json   Local development seed fixtures
tooling/
  d1/                       D1 adapters used by backfills
  manage/                   Generic backfill discovery and runner
plugins/
  oxlint-boundary-plugin.ts Client/server boundary lint rule
scripts/
  deploy.py                 Deploy-time Wrangler/Doppler validation
```

## Verification

```sh
bun run db:generate:events
bun run db:generate:app
git diff --exit-code -- drizzle
bun run db:smoke
bun run test
bun run check
bun run lint
bun run fmt:check
bunx astro build
```

CI checks that the Drizzle schema generates no migration drift, migrates and
seeds a fresh local D1 database, runs the tests and type checks, lints, checks
formatting, and builds the Worker on pull requests and pushes to `main`.
`bun run lint` also runs the `boundary/scopes` Oxlint plugin, which rejects
imports from client UI modules into server/database modules and vice versa.
