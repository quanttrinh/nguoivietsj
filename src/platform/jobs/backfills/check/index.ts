// @boundary server
/* oxlint-disable typescript/no-unsafe-type-assertion -- Wrangler JSON output is parsed at this tooling boundary. */
import { parseArgs } from "node:util";

import {
  databaseFor,
  selectedBindings,
  targetConfig,
  targetName,
  wranglerArgs,
  type TargetConfig,
  type TargetName,
} from "#tooling/d1/config";
import { runQuiet, wranglerCommand } from "#tooling/d1/wrangler";
import { defineBackfill } from "#tooling/manage/backfill";
import {
  COLUMNS_SQL,
  compareColumns,
  expectedColumns,
  parseColumns,
} from "~/platform/server/db/schema-parity";

import { APP_TABLES, EVENT_TABLES } from "./schema-tables";

interface D1Result {
  results?: Record<string, unknown>[];
}

async function query(
  config: TargetConfig,
  binding: string,
  sql: string,
): Promise<Record<string, unknown>[]> {
  const output = await runQuiet(
    [
      ...(await wranglerCommand()),
      "d1",
      "execute",
      databaseFor(config, binding).name,
      "--json",
      "--command",
      sql,
      ...wranglerArgs(config),
    ],
    false,
  );
  const parsed = JSON.parse(output) as D1Result | D1Result[];
  const result = Array.isArray(parsed) ? parsed[0] : parsed;
  return result?.results ?? [];
}

async function checkDatabase(config: TargetConfig, binding: string): Promise<string[]> {
  const expected = expectedColumns(binding === "APP_DB" ? APP_TABLES : EVENT_TABLES);
  // One pragma join returns every table and column in a single Wrangler call.
  const columnRows = await query(config, binding, COLUMNS_SQL);
  const actual = parseColumns(columnRows);
  const problems = compareColumns(expected, actual);

  if (binding === "EVENT_ENGINE_DB" && !actual.has("registration_search")) {
    problems.push("missing virtual table: registration_search (run events migrations)");
  }

  return problems;
}

async function check(target: TargetName, database: string | undefined) {
  const config = await targetConfig(target);
  let failed = false;

  for (const binding of selectedBindings(config, database)) {
    const { name } = databaseFor(config, binding);
    console.log(`Checking ${name} schema on ${target}.`);
    // oxlint-disable-next-line eslint/no-await-in-loop -- Wrangler commands share one local D1 state directory.
    const problems = await checkDatabase(config, binding);

    if (problems.length === 0) {
      console.log(`  ${name}: schema is up to date.`);
    } else {
      failed = true;
      for (const problem of problems) {
        console.error(`  ${name}: ${problem}`);
      }
    }
  }

  return failed ? 1 : 0;
}

export default defineBackfill({
  description: "Verify local/remote tables and columns match the Drizzle schema.",
  usage: "bun manage.ts check --target local -- --database all",
  run: async (context, args) => {
    const { values } = parseArgs({
      args,
      allowPositionals: false,
      options: {
        database: { type: "string", default: "all" },
      },
      strict: true,
    });
    const target = await targetName(context.target);

    if ((await check(target, values.database)) !== 0) {
      throw new Error("Schema check failed.");
    }
  },
});
