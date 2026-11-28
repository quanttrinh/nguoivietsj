// @boundary server
import { readFile } from "node:fs/promises";

import { createD1Context } from "#tooling/d1/d1";
import { defineBackfill } from "#tooling/manage/backfill";

export default defineBackfill({
  description: "Rebuild registration and ticket-type aggregate counters.",
  run: async (context, args) => {
    if (args.length > 0) {
      throw new Error("This backfill does not accept arguments.");
    }

    const sqlFile = await readFile(new URL("backfill.sql", import.meta.url), "utf8");
    const sql = sqlFile.trim();
    const db = await createD1Context(context.target, context.dryRun, context.log);
    await db.database.execute("EVENT_ENGINE_DB", sql);
  },
});
