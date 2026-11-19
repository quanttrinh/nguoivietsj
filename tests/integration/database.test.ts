import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { APP_TABLES, EVENT_TABLES } from "../../src/backfills/check/schema-tables";
import { seedEventSql, seedUsersSql } from "../../src/backfills/seed";
import {
  COLUMNS_SQL,
  compareColumns,
  expectedColumns,
  parseColumns,
} from "../../src/db/schema-parity";

type D1 = Awaited<ReturnType<Miniflare["getD1Database"]>>;

// Import the SQL so Vitest's affected-test graph includes migrations.
const APP_MIGRATIONS = import.meta.glob<string>("../../drizzle/app/*/migration.sql", {
  query: "?raw",
  import: "default",
  eager: true,
});
const EVENT_MIGRATIONS = import.meta.glob<string>("../../drizzle/events/*/migration.sql", {
  query: "?raw",
  import: "default",
  eager: true,
});

let mf: Miniflare;
let app: D1;
let events: D1;

async function applyMigrations(db: D1, migrations: Record<string, string>): Promise<void> {
  const scripts = Object.keys(migrations)
    .toSorted()
    .map((path) => migrations[path] ?? "");

  for (const sql of scripts) {
    for (const statement of sql.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();

      if (trimmed.length > 0) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- migrations must run in order.
        await db.prepare(trimmed).run();
      }
    }
  }
}

/** Split a generated SQL script into statements without breaking quoted text. */
function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let quoted = false;

  for (const char of sql) {
    current += char;

    if (char === "'") {
      quoted = !quoted;
    } else if (char === ";" && !quoted) {
      statements.push(current.trim());
      current = "";
    }
  }

  if (current.trim().length > 0) {
    statements.push(current.trim());
  }

  return statements.filter((statement) => statement.length > 0);
}

async function runScript(db: D1, sql: string): Promise<void> {
  await db.batch(splitStatements(sql).map((statement) => db.prepare(statement)));
}

async function columns(db: D1): Promise<Map<string, Set<string>>> {
  const result = await db.prepare(COLUMNS_SQL).all();

  return parseColumns(result.results);
}

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    compatibilityDate: "2026-08-06",
    d1Databases: { APP_DB: "app", EVENT_ENGINE_DB: "events" },
  });

  app = await mf.getD1Database("APP_DB");
  events = await mf.getD1Database("EVENT_ENGINE_DB");

  await applyMigrations(app, APP_MIGRATIONS);
  await applyMigrations(events, EVENT_MIGRATIONS);
});

afterAll(async () => {
  await mf.dispose();
});

describe("database migrations", () => {
  test("app schema matches the Drizzle definitions", async () => {
    expect(compareColumns(expectedColumns(APP_TABLES), await columns(app))).toEqual([]);
  });

  test("events schema matches the Drizzle definitions", async () => {
    const actual = await columns(events);

    expect(compareColumns(expectedColumns(EVENT_TABLES), actual)).toEqual([]);
    expect(actual.has("registration_search")).toBe(true);
  });
});

describe("seed data", () => {
  beforeAll(async () => {
    await runScript(app, await seedUsersSql());
    await runScript(events, seedEventSql().sql);
  });

  test("seeds the local staff accounts", async () => {
    const row = await app.prepare("SELECT COUNT(*) AS count FROM user").first<{ count: number }>();

    expect(row?.count).toBe(2);
  });

  test("seeds events, registrations, and ticket stats", async () => {
    const eventRow = await events
      .prepare("SELECT COUNT(*) AS count FROM events")
      .first<{ count: number }>();
    const registrationRow = await events
      .prepare("SELECT COUNT(*) AS count FROM registrations")
      .first<{ count: number }>();
    const ticketRow = await events
      .prepare("SELECT COUNT(*) AS count FROM registration_tickets")
      .first<{ count: number }>();

    expect(eventRow?.count).toBeGreaterThan(0);
    expect(registrationRow?.count).toBeGreaterThan(0);
    expect(ticketRow?.count).toBeGreaterThan(0);
  });
});
