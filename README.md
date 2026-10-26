# Người Việt SJ

Community events and registration for the Vietnamese community in Saint John,
hosted on Cloudflare Workers.

The platform supports multiple events and editions, ticket types, predefined
contacts, custom fields, conditional sections, reusable form versions, manual
payment confirmation, QR check-in, and staff support tools.

## Stack

- Astro 7 with static pages, Cloudflare Worker endpoints, and Preact islands
- Cloudflare Workers, D1, Queues, Workers Cache, Rate Limiting, and Turnstile
- Cloudflare Access for staff/admin authentication
- Drizzle ORM and Drizzle Kit for the two D1 databases
- TypeBox for API and form-schema validation
- Effect for selected server-side workflows
- Intlayer for localized content
- Qui and PandaCSS for form controls and page styling

## Requirements

- Bun 1.4.4
- Python 3 for `manage.py`
- Wrangler
- A Cloudflare account for deployment

## Local development

Create the local environment file:

```sh
cp .env.example .env.local
```

Set `NODE_AUTH_TOKEN` if installing packages from GitHub Packages. Set
`DEV_STAFF_EMAIL` to the local admin identity you want to use.

Install dependencies and prepare local data:

```sh
bun install
python manage.py migrate --target local
python manage.py seed
```

`bun install` runs Panda codegen and `wrangler types`. The generated
`worker-configuration.d.ts` is intentionally ignored by git.

`python manage.py seed` recreates local test events, forms, registrations,
payments, check-ins, status links, and the local users:

- `admin@example.com` — admin
- `staff@example.com` — staff

Start the development server:

```sh
bun run dev
```

Useful local URLs:

- Public event list: `http://localhost:4321/en/events/`
- Public registration: `http://localhost:4321/en/events/registration?slug=summer-picnic-2027`
- Admin catalog: `http://localhost:4321/en/events/admin`

The development staff fallback is compiled behind `import.meta.env.DEV` and
does not run in production or staging.

## Commands

```sh
bun run dev              # Astro dev server
bun run build            # production build
bun run preview          # preview the built worker
bun run check            # Astro type/diagnostic check
bun run typecheck        # check + oxlint + oxfmt check
bun run lint             # oxlint
bun run lint:fix         # oxlint --fix
bun run fmt              # oxfmt
bun run fmt:check        # oxfmt --check
bun run test             # Bun tests
```

Database and account commands:

```sh
python manage.py migrate --target local
python manage.py migrate --target staging
python manage.py migrate --target production
python manage.py migrate --target local --database events

python manage.py optimize --target production
python manage.py create-user staff@example.com --role staff
python manage.py create-user admin@example.com --role admin --target production

python manage.py list-backfills
python manage.py backfill registration-stats --target local
python manage.py backfill registration-stats --target production --dry-run
```

Targets are `local`, `staging`, and `production`. Database selection is `app`,
`events`, or `all`. Seed data is local-only.

## Environment variables

`.env.example` contains the complete local template.

| Variable | Purpose |
| --- | --- |
| `NODE_AUTH_TOKEN` | GitHub Packages token used by `.npmrc` during install |
| `DEV_STAFF_EMAIL` | Development-only staff identity |
| `TURNSTILE_SITE_KEY` | Public Turnstile site key |
| `TURNSTILE_SCRIPT_URL` | Turnstile script URL |
| `TURNSTILE_VERIFY_URL` | Turnstile server verification URL |
| `TURNSTILE_ALLOW_TEST_KEY` | Allows Cloudflare test keys in non-production checks |
| `TURNSTILE_SECRET` | Turnstile secret, stored with Wrangler |
| `CF_ACCESS_TEAM_DOMAIN` | Cloudflare Access team domain |
| `CF_ACCESS_AUD` | Cloudflare Access application audience |
| `MAILTRAP_API_TOKEN` | Mailtrap sending token, stored with Wrangler |
| `MAILTRAP_API_URL` | Mailtrap send endpoint |
| `MAILTRAP_FROM_EMAIL` | Verified sender address |
| `MAILTRAP_FROM_NAME` | Sender display name |
| `MAILTRAP_REGISTRATION_TEMPLATE_UUID` | Registration-received template |
| `MAILTRAP_PAYMENT_TEMPLATE_UUID` | Payment-confirmed template |
| `MAILTRAP_STATUS_OTP_TEMPLATE_UUID` | Status recovery template |

Secrets are `TURNSTILE_SECRET` and `MAILTRAP_API_TOKEN`. Everything else is a
Worker variable or a local development value.

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

## Database

Two D1 databases are used:

- `APP_DB` — application identities and roles
- `EVENT_ENGINE_DB` — events, forms, registrations, contacts, tickets, answers,
  payments, check-ins, status sessions, and email delivery records

Migrations are managed by Drizzle Kit:

```sh
bun run db:generate              # generate event database migration
bun run db:generate:app          # generate app migration
bun run db:generate:custom       # custom event database migration
bun run db:generate:app:custom   # custom app migration
```

Registration writes use one transactional D1 batch. Database triggers enforce
ticket limits and event/ticket-type capacity, so the service and the database
both check those constraints.

`worker-configuration.d.ts` is generated by `wrangler types` after install or
by `bun run cf-typegen`.

## Routes

### Public

| Route | Purpose |
| --- | --- |
| `/{locale}/events` | Public event list |
| `/{locale}/events/registration?slug={slug}` | Event details and registration form |
| `/{locale}/events/status` | Status recovery with email OTP |
| `/{locale}/events/status/view?token={token}` | Tokenized registration status page |
| `/api/events/public/events` | Public event list API |
| `/api/events/public/events/{slug}` | Public event detail and form API |
| `/api/events/public/events/{slug}/registrations` | Registration submission |
| `/api/events/public/registrations/{id}/qr?token=...` | Tokenized check-in QR SVG |
| `/api/events/status/request` | Request a status OTP |
| `/api/events/status/verify` | Verify OTP and issue a token |
| `/api/events/status/{token}` | Status page data |

### Staff pages

Staff and admin pages require Cloudflare Access. The `users.role` column decides
what an identity can do.

| Route | Purpose |
| --- | --- |
| `/{locale}/events/admin` | Event catalog |
| `/{locale}/events/admin/view?event={id}` | Event detail |
| `/{locale}/events/admin/view/support?event={id}` | Registration search |
| `/{locale}/events/admin/view/activity?event={id}` | Staff activity history |
| `/{locale}/events/admin/view/checkin?event={id}` | Camera or manual check-in |
| `/{locale}/events/admin/view/payments?event={id}` | Payment confirmation |
| `/{locale}/events/admin/view/qr?event={id}&registration={rid}` | Printable registration QR |

### Admin pages

Admin-only pages add:

- Create, edit, clone, and archive events
- Ticket type management
- Form version creation, editing, and preview
- Event settings, aliases, notes, and payment instructions

### Staff/admin APIs

| Route | Purpose |
| --- | --- |
| `GET /api/events/admin/events` | List events |
| `GET /api/events/admin/events/{id}` | Read event |
| `GET /api/events/admin/events/{id}/overview` | Admin detail overview |
| `GET /api/events/admin/events/{id}/registrations` | List registrations |
| `GET /api/events/admin/events/{id}/support` | Search registrations |
| `GET /api/events/admin/events/{id}/activity` | Activity history |
| `GET /api/events/admin/events/{id}/payments` | Payment list |
| `GET /api/events/admin/events/{id}/checkins` | Check-in list |
| `GET /api/events/admin/events/{id}/registrations/{rid}/qr` | Registration QR |
| `POST /api/events/admin/events/{id}/checkins` | Check in |
| `DELETE /api/events/admin/events/{id}/checkins/{rid}` | Undo check-in |
| `POST/DELETE /api/events/admin/events/{id}/payments/{rid}` | Confirm or remove payment |
| `POST /api/events/admin/events/{id}/registrations` | Staff-created registration |

Admin-only APIs also cover event create/update, ticket types, form versions, and
form previews.

## Authentication and security

Cloudflare Access protects staff/admin pages and APIs. The Worker validates the
Access JWT and matches the email to an `APP_DB.users` row with role `staff` or
`admin`.

- `withStaffRoute` protects staff and admin APIs.
- `withAdminRoute` protects admin-only APIs.
- `requireStaffPage` and `requireAdminPage` protect pages.
- `withSameOriginRoute` protects public mutations.
- Middleware validates locale prefixes, redirects locale-less paths, and applies
  security headers.
- Registration is also protected by Turnstile and a per-IP rate limiter.

There is no in-app login form. Production identity comes from Access; local
development can use `DEV_STAFF_EMAIL`.

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

A six-digit code is sent by Mailtrap and exchanged for a new status token. Codes:

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

Registration, payment, and status-code emails use Mailtrap-hosted templates and
the shared `EMAIL_QUEUE`. Jobs carry an idempotency key recorded in
`email_deliveries`, so completed messages are not sent again on retry. Failed
messages retry and then move to the environment's dead-letter queue.

The payment template embeds the QR through the `checkin-qr` content ID. No
application-side email HTML is generated.

## Caching

Public event pages and public read APIs use `cacheCloudflare()` through Astro
route rules:

- fresh for 60 seconds
- stale-while-revalidate for 300 seconds

Cache tags:

- `event-list`
- `event:{eventId}`

Event, ticket-type, and published-form changes invalidate the relevant tags.
Registration counts and remaining ticket quantities may be up to 60 seconds
stale. The registration service remains authoritative.

Admin, preview, mutation, and registration POST responses are never cached.

## Cloudflare infrastructure

Wrangler manages:

- the Worker, assets, routes, and custom domains
- D1 bindings
- email queue and dead-letter queue
- rate-limit bindings
- Worker variables and secrets

OpenTofu under `infra/cloudflare/` manages:

- zone TLS/HTTPS and HSTS settings
- Turnstile widget
- WAF registration challenge
- rate-limiting rule
- Cloudflare Access applications and policies
- optional DNS records not owned by Wrangler
- read-only D1/Zero Trust discovery for config sync

After applying infrastructure:

```sh
bun run cf:sync
```

This updates the non-secret values in `wrangler.jsonc`:

- Turnstile site key
- Access team domain and audience
- D1 database names and IDs

Use the drift check in CI:

```sh
bun run cf:sync:check
```

See [`infra/cloudflare/README.md`](./infra/cloudflare/README.md) for token
permissions, Turnstile setup, Access policies, and state backend details.

## Deployment

1. Apply D1 migrations:
   ```sh
   python manage.py migrate --target production
   ```
2. Apply OpenTofu and sync generated values:
   ```sh
   tofu -chdir=infra/cloudflare apply
   bun run cf:sync
   ```
3. Store secrets:
   ```sh
   bunx wrangler secret put TURNSTILE_SECRET
   bunx wrangler secret put MAILTRAP_API_TOKEN
   ```
4. Verify Mailtrap sender and templates.
5. Build and deploy:
   ```sh
   bun run deploy
   ```

For staging, use the staging environment explicitly:

```sh
python manage.py migrate --target staging
CLOUDFLARE_ENV=staging bun run build
bunx wrangler deploy --env staging
```

Do not enable the WAF registration challenge until the Worker deployed with the
matching Turnstile widget and secret.

## Project layout

```text
manage.py                    D1 migrations, users, optimization, backfills
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
infra/cloudflare/           Access, WAF, Turnstile, DNS, TLS, D1 discovery
scripts/                    Config sync and utility scripts
```

## Verification

```sh
bun run test
bun run check
bun run lint
bun run fmt:check
bun run build
```

CI runs tests, type checks, linting, formatting, and the production build on pull
requests and pushes to `main`.
