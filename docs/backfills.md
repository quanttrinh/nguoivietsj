# Backfills

Every manage CLI task is a backfill under `src/backfills/<name>/index.ts`:

```ts
import { createD1Context } from "#tooling/d1/d1";
import { defineBackfill } from "#tooling/manage/backfill";

export default defineBackfill({
  description: "What this does.",
  usage: "bun manage.ts backfill example -- <args>",
  run: async (context, args) => {
    const db = await createD1Context(context.target, context.dryRun, context.log);
    await db.database.execute("EVENT_ENGINE_DB", "SELECT 1");
  },
});
```

The manager core only passes `target`, `dryRun`, and `log` — it does not import D1
or Wrangler. Database-backed backfills opt in via `createD1Context()`, which reads
the Wrangler config and discovers the physical database names for the target.
Backfills address databases by Worker binding (`APP_DB`, `EVENT_ENGINE_DB`); the
CLI accepts any discovered binding or `all`. Since Wrangler's D1 CLI cannot bind
positional parameters, SQL is serialized with Drizzle's `inlineParams()`. Dry-run
prints that SQL instead of executing it.

## Usage

```sh
bun manage.ts list
bun manage.ts help registration-stats
bun manage.ts backfill registration-stats --target staging --dry-run
bun manage.ts backfill registration-stats --target staging
bun manage.ts backfill create-user --target production -- admin@example.com --role admin
bun manage.ts backfill create-user --target staging -- admin@example.com --role admin --password "$CREATE_USER_PASSWORD"
bun manage.ts backfill two-factor-required --target staging -- admin@example.com --required false
```

Global options (`--target`, `--dry-run`, `--help`) go before `--`; arguments
after `--` belong to the backfill. Targets: `local`, `production`, and every
environment defined in `wrangler.json` (currently `staging`). Databases: any
discovered binding (`APP_DB`, `EVENT_ENGINE_DB`) or `all`.

`create-user` accepts `--password` (12–128 characters). When supplied, the
backfill also writes a Better Auth `credential` account with a PBKDF2 hash, so
the user can sign in immediately; when omitted, it only sets the user's role
and a password must be set later in Admin → Users. Prefer injecting the secret
through the `CREATE_USER_PASSWORD` environment variable (used when `--password`
is absent) over putting it in shell history or the GitHub Actions `args` input.

Backfill output — including dry-run SQL — is not printed to CI logs. It is
written to a log file and uploaded to a fixed key in the private R2 bucket.

`two-factor-required` sets the user's `two_factor_required` flag. All users
default to required; `--required false` lets an account that cannot use an
authenticator skip enrollment. Users who are already enrolled are still
challenged at sign-in. The change applies on the user's next sign-in.

`seed`, `migrate`, `check`, `optimize`, and `create-user` are backfills too;
`bun manage.ts seed` is shorthand for `bun manage.ts backfill seed`. These
commands default to `--target local`.
