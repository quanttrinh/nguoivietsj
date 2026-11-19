// @boundary server
/* oxlint-disable typescript/no-unsafe-type-assertion -- Wrangler JSON output is parsed at this tooling boundary. */
import { parseArgs } from "node:util";

import { getTableConfig } from "drizzle-orm/sqlite-core";

import {
  DATABASES,
  TARGET_CONFIGS,
  databaseName,
  selectedDatabases,
  wranglerArgs,
  type DatabaseName,
  type TargetName,
} from "#tooling/d1/config";
import { createD1Context } from "#tooling/d1/d1";
import { runQuiet, wranglerCommand } from "#tooling/d1/wrangler";
import { defineBackfill } from "#tooling/manage/backfill";

import { APP_TABLES, EVENT_TABLES } from "./schema-tables";

interface D1Result {
  results?: Record<string, unknown>[];
}

async function query(
  target: TargetName,
  database: "app" | "events",
  sql: string,
): Promise<Record<string, unknown>[]> {
  const config = TARGET_CONFIGS[target];
  const output = await runQuiet(
    [
      ...(await wranglerCommand()),
      "d1",
      "execute",
      databaseName(config, database),
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

function expectedTables(database: "app" | "events"): Map<string, string[]> {
  const tables = database === "app" ? APP_TABLES : EVENT_TABLES;
  return new Map(
    tables.map((table) => {
      const config = getTableConfig(table);
      return [config.name, config.columns.map((column) => column.name)];
    }),
  );
}

async function checkDatabase(target: TargetName, database: "app" | "events"): Promise<string[]> {
  const expected = expectedTables(database);
  // One pragma join returns every table and column in a single Wrangler call.
  const columnRows = await query(
    target,
    database,
    `SELECT m.name AS table_name, p.name AS column_name
     FROM sqlite_master AS m
     JOIN pragma_table_info(m.name) AS p
     WHERE m.type = 'table'
       AND m.name NOT LIKE 'sqlite_%'
       AND m.name NOT LIKE '_cf_%'`,
  );
  const actual = new Map<string, Set<string>>();

  for (const row of columnRows) {
    const table = String(row.table_name);
    const column = String(row.column_name);
    const columns = actual.get(table) ?? new Set<string>();

    columns.add(column);
    actual.set(table, columns);
  }

  const problems: string[] = [];

  for (const [table, columns] of expected) {
    const actualColumns = actual.get(table);

    if (actualColumns === undefined) {
      problems.push(`missing table: ${table}`);
    } else {
      for (const column of columns) {
        if (!actualColumns.has(column)) {
          problems.push(`missing column: ${table}.${column}`);
        }
      }
    }
  }

  if (database === "events" && !actual.has("registration_search")) {
    problems.push("missing virtual table: registration_search (run events migrations)");
  }

  return problems;
}

async function check(targetName: TargetName, database: DatabaseName): Promise<number> {
  let failed = false;

  for (const selected of selectedDatabases(database)) {
    console.log(`Checking ${selected} schema on ${targetName}.`);
    // oxlint-disable-next-line eslint/no-await-in-loop -- Wrangler commands share one local D1 state directory.
    const problems = await checkDatabase(targetName, selected);

    if (problems.length === 0) {
      console.log(`  ${selected}: schema is up to date.`);
    } else {
      failed = true;
      for (const problem of problems) {
        console.error(`  ${selected}: ${problem}`);
      }
    }
  }

  return failed ? 1 : 0;
}

function databaseOption(value: string): DatabaseName {
  if (!DATABASES.includes(value as DatabaseName)) {
    throw new Error(`Invalid database: ${value}`);
  }

  return value as DatabaseName;
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
    const database = databaseOption(values.database);
    const db = createD1Context(context.target, context.dryRun, context.log);

    if ((await check(db.target, database)) !== 0) {
      throw new Error("Schema check failed.");
    }
  },
});
