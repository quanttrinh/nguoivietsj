import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  getEventRepository,
  toEventRecord,
  type EventListOptions,
  type EventListResult,
} from "~/platform/server/db/events/events";
import { getEngineOrm, type EngineOrm } from "~/platform/server/db/events/orm";
import {
  getRegistrationRepository,
  toRegistrationSummary,
} from "~/platform/server/db/events/registrations";
import { events } from "~/platform/server/db/events/schemas";

import { startDatabase, type TestDatabase } from "../helpers/d1";
import { eventIdBySlug } from "../helpers/events";

let db: TestDatabase;
let orm: EngineOrm;

beforeAll(async () => {
  db = await startDatabase();
  orm = getEngineOrm(db.events);
});

afterAll(async () => {
  await db.dispose();
});

/** The relational implementation that Phase 6 replaced, used as the parity oracle. */
async function legacyList(options: EventListOptions): Promise<EventListResult> {
  const rows = await orm.query.events.findMany({
    with: { aliases: true, stats: true },
    orderBy: { createdAt: "desc", id: "desc" },
    limit: options.limit,
    offset: options.offset,
    extras: { total: sql<number>`count(*) over ()` },
  });
  let total = rows[0]?.total ?? 0;

  if (rows.length === 0) {
    total = await orm.$count(events);
  }

  return { events: rows.map((row) => toEventRecord(row)), total };
}

async function legacySummaries(eventId: string, limit: number) {
  const rows = await orm.query.registrations.findMany({
    where: { eventId },
    with: { contacts: true, tickets: true },
    orderBy: { createdAt: "desc", id: "desc" },
    limit,
  });

  return rows.map((row) => toRegistrationSummary(row));
}

describe("prepared events.list", () => {
  test("matches the relational result for multiple events with aliases and stats", async () => {
    const options = { limit: 10, offset: 0 };
    const actual = await getEventRepository(db.events).list(options);
    const expected = await legacyList(options);

    expect(actual).toEqual(expected);
    expect(actual.total).toBeGreaterThan(1);
    expect(actual.events[0]?.aliases.length).toBeGreaterThan(0);
    expect(actual.events[0]?.registrationCount).toBeGreaterThan(0);
  });

  test("matches the relational result for an empty page, including total", async () => {
    const options = { limit: 10, offset: 1000 };
    const actual = await getEventRepository(db.events).list(options);
    const expected = await legacyList(options);

    expect(actual).toEqual(expected);
    expect(actual.events).toEqual([]);
    expect(actual.total).toBeGreaterThan(0);
  });

  test("matches the relational result with limit and offset", async () => {
    const options = { limit: 1, offset: 1 };
    const actual = await getEventRepository(db.events).list(options);
    const expected = await legacyList(options);

    expect(actual).toEqual(expected);
    expect(actual.events).toHaveLength(1);
    expect(actual.total).toBeGreaterThan(1);
  });
});

describe("prepared registrations.listSummariesByEvent", () => {
  test("matches the relational result with contacts and tickets", async () => {
    const eventId = await eventIdBySlug(db, "summer-picnic-2027");
    const actual = await getRegistrationRepository(db.events).listSummariesByEvent(eventId, 10);
    const expected = await legacySummaries(eventId, 10);

    expect(actual).toEqual(expected);
    expect(actual.length).toBeGreaterThan(1);
    expect(actual[0]?.contacts.length).toBeGreaterThan(0);
    expect(actual[0]?.tickets.length).toBeGreaterThan(0);
    expect(actual.some((row) => row.contacts.some((contact) => contact.kind === "mail"))).toBe(
      true,
    );
  });

  test("matches the relational result with a limit", async () => {
    const eventId = await eventIdBySlug(db, "test-event-2027");
    const actual = await getRegistrationRepository(db.events).listSummariesByEvent(eventId, 1);
    const expected = await legacySummaries(eventId, 1);

    expect(actual).toEqual(expected);
    expect(actual).toHaveLength(1);
  });

  test("matches the relational result for an unknown event", async () => {
    const eventId = "00000000-0000-7000-8000-000000000000";

    expect(await getRegistrationRepository(db.events).listSummariesByEvent(eventId, 10)).toEqual(
      await legacySummaries(eventId, 10),
    );
  });
});
