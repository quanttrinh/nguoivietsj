// @boundary server
import { parseArgs } from "node:util";

import { databaseFor, selectedBindings } from "#tooling/d1/config";
import { createD1Context } from "#tooling/d1/d1";
import { runWrangler } from "#tooling/d1/wrangler";
import { defineBackfill } from "#tooling/manage/backfill";

export default defineBackfill({
  description: "Run PRAGMA optimize on the selected D1 databases.",
  usage:
    "node --import ./scripts/register-node.ts manage.ts optimize --target local -- --database all",
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
      db.log(`Optimizing ${name} on ${db.target}.`);

      if (!db.dryRun) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- database commands must be sequential.
        await runWrangler(db.targetConfig, ["d1", "execute", name, "--command", "PRAGMA optimize"]);
      }
    }
  },
});
