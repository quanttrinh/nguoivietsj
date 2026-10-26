// @boundary server
import { parseArgs } from "node:util";

import { DATABASES, databaseName, selectedDatabases, type DatabaseName } from "#tooling/d1/config";
import { createD1Context } from "#tooling/d1/d1";
import { runWrangler } from "#tooling/d1/wrangler";
import { defineBackfill } from "#tooling/manage/backfill";

function databaseOption(value: string): DatabaseName {
  const database = DATABASES.find((candidate) => candidate === value);

  if (database === undefined) {
    throw new Error(`Invalid database: ${value}`);
  }

  return database;
}

export default defineBackfill({
  description: "Run PRAGMA optimize on the selected D1 databases.",
  usage: "bun manage.ts optimize --target local -- --database all",
  run: async (context, args) => {
    const { values } = parseArgs({
      args,
      allowPositionals: false,
      options: {
        database: { type: "string", default: "all" },
      },
      strict: true,
    });
    const database = databaseOption(values.database);
    const db = createD1Context(context.target, context.dryRun, context.log);

    for (const selected of selectedDatabases(database)) {
      db.log(`Optimizing ${selected} on ${db.target}.`);

      if (!db.dryRun) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- database commands must be sequential.
        await runWrangler(db.targetConfig, [
          "d1",
          "execute",
          databaseName(db.targetConfig, selected),
          "--command",
          "PRAGMA optimize",
        ]);
      }
    }
  },
});
