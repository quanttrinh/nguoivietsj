# Backfills

Every manage CLI task is a backfill under `src/backfills/<name>/index.ts`:

```ts
import { createD1Context } from "#tooling/d1/d1";
import { defineBackfill } from "#tooling/manage/backfill";

export default defineBackfill({
  description: "What this does.",
  usage: "bun manage.ts backfill example -- <args>",
  run: async (context, args) => {
    const db = createD1Context(context.target, context.dryRun, context.log);
    await db.database.execute("events", "SELECT 1");
  },
});
```

The manager core only passes `target`, `dryRun`, and `log` — it does not import D1
or Wrangler. Database-backed backfills opt in via `createD1Context()` and import
their own Drizzle schema/ORM. Since Wrangler's D1 CLI cannot bind positional
parameters, SQL is serialized with Drizzle's `inlineParams()`. Dry-run prints
that SQL instead of executing it.

## Usage

```sh
bun manage.ts list
bun manage.ts help registration-stats
bun manage.ts backfill registration-stats --target staging --dry-run
bun manage.ts backfill registration-stats --target staging
bun manage.ts backfill create-user --target production -- admin@example.com --role admin
```

Global options (`--target`, `--dry-run`, `--help`) go before `--`; arguments
after `--` belong to the backfill. Targets: `local`, `staging`, `production`.
Databases: `app`, `events`, `all`.

`seed`, `migrate`, `check`, `optimize`, and `create-user` are backfills too;
`bun manage.ts seed` is shorthand for `bun manage.ts backfill seed`. These
commands default to `--target local`.
