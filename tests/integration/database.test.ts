import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { APP_TABLES, EVENT_TABLES } from "../../src/backfills/check/schema-tables";
import {
  COLUMNS_SQL,
  compareColumns,
  expectedColumns,
  parseColumns,
} from "../../src/db/schema-parity";
import { startDatabase, type TestDatabase } from "./helpers/d1";

let db: TestDatabase;

beforeAll(async () => {
  db = await startDatabase();
});

afterAll(async () => {
  await db.dispose();
});

async function columns(database: TestDatabase["app"]): Promise<Map<string, Set<string>>> {
  const result = await database.prepare(COLUMNS_SQL).all();

  return parseColumns(result.results);
}

describe("database migrations", () => {
  test("app schema matches the Drizzle definitions", async () => {
    expect(compareColumns(expectedColumns(APP_TABLES), await columns(db.app))).toEqual([]);
  });

  test("events schema matches the Drizzle definitions", async () => {
    const actual = await columns(db.events);

    expect(compareColumns(expectedColumns(EVENT_TABLES), actual)).toEqual([]);
    expect(actual.has("registration_search")).toBe(true);
  });
});

describe("seed data", () => {
  test("seeds the local staff accounts", async () => {
    const row = await db.app
      .prepare("SELECT COUNT(*) AS count FROM user")
      .first<{ count: number }>();

    expect(row?.count).toBe(2);
  });

  test("seeds events, registrations, and ticket stats", async () => {
    const eventRow = await db.events
      .prepare("SELECT COUNT(*) AS count FROM events")
      .first<{ count: number }>();
    const registrationRow = await db.events
      .prepare("SELECT COUNT(*) AS count FROM registrations")
      .first<{ count: number }>();
    const ticketRow = await db.events
      .prepare("SELECT COUNT(*) AS count FROM registration_tickets")
      .first<{ count: number }>();

    expect(eventRow?.count).toBeGreaterThan(0);
    expect(registrationRow?.count).toBeGreaterThan(0);
    expect(ticketRow?.count).toBeGreaterThan(0);
  });
});
