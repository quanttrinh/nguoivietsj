// @boundary server
import { parseArgs } from "node:util";

import { databaseFor, selectedBindings } from "#tooling/d1/config";
import { createD1Context } from "#tooling/d1/d1";
import { runWrangler } from "#tooling/d1/wrangler";
import { defineBackfill } from "#tooling/manage/backfill";

export default defineBackfill({
  description: "Apply Wrangler D1 migrations.",
  usage: "node manage.ts migrate --target local -- --database all",
  run: async (context, args) => {
    const { values } = parseArgs({
      args,
      allowPositionals: false,
      options: {
        database: { type: "string", default: "all" },
      },
      strict: true,
    });
    const db = await createD1Context(context.target, context.dryRun, context.log);

    for (const binding of selectedBindings(db.targetConfig, values.database)) {
      const { name } = databaseFor(db.targetConfig, binding);
      db.log(`Applying ${name} migrations to ${db.target}.`);

      if (!db.dryRun) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- migrations must be sequential.
        await runWrangler(db.targetConfig, ["d1", "migrations", "apply", name, "--force"]);
      }
    }
  },
});
