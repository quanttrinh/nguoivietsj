/* oxlint-disable typescript/no-unsafe-type-assertion -- API response bodies and raw D1 JSON columns are asserted in tests. */
import { describe, expect, onTestFinished } from "vitest";

import { seedFormSchema } from "../../../src/backfills/seed";
import { eventIdBySlug } from "../helpers/events";
import { test, type ApiHarness } from "./harness";

const NEW_SLUG = "db-flow-event-2031";
const NEW_ALIASES = ["db-flow-2031", "db-flow-fall-2031"];
const CONFLICT_SLUG = "db-flow-conflict-2032";

const TITLE = { en: "DB Flow Event 2031", fr: "Événement DB Flow 2031" };
const SUMMARY = { en: "A full lifecycle test event." };
const LIMITS = { currency: "CAD", maxTicketsPerRegistration: 6, maxTotalTickets: 500 };

const PUBLISHED_SCHEMA = seedFormSchema(
  ["general", "vip"],
  [{ key: "company", type: "text", required: false, label: { en: "Company" } }],
  false,
);
const REVISED_SCHEMA = seedFormSchema(
  ["general", "vip"],
  [{ key: "team", type: "text", required: false, label: { en: "Team" } }],
  false,
);

interface TicketTypePayload {
  key: string;
  label: Record<string, string>;
  description: Record<string, string>;
  priceMinor: number;
  minPerRegistration: number;
  maxPerRegistration: number;
  defaultQuantity: number;
  capacity: number;
  active: boolean;
  sortOrder: number;
}

function ticketTypes(): TicketTypePayload[] {
  return [
    {
      key: "general",
      label: { en: "General Admission" },
      description: { en: "Standard entry" },
      priceMinor: 4250,
      minPerRegistration: 1,
      maxPerRegistration: 4,
      defaultQuantity: 1,
      capacity: 120,
      active: true,
      sortOrder: 10,
    },
    {
      key: "vip",
      label: { en: "VIP Entry" },
      description: { en: "Front row" },
      priceMinor: 9000,
      minPerRegistration: 0,
      maxPerRegistration: 2,
      defaultQuantity: 0,
      capacity: 20,
      active: true,
      sortOrder: 20,
    },
  ];
}

function createPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    slug: NEW_SLUG,
    eventType: "conference",
    editionYear: 2031,
    defaultLocale: "en",
    title: TITLE,
    summary: SUMMARY,
    startsAt: "2031-05-01T10:00:00.000Z",
    endsAt: "2031-05-01T18:00:00.000Z",
    timezone: "UTC",
    status: "upcoming",
    enabled: true,
    registrationOpen: true,
    aliases: NEW_ALIASES,
    limits: LIMITS,
    ticketTypes: ticketTypes(),
    location: { name: "Test Hall", address: "1 Test Street" },
    payments: { cash: { enabled: true, address: "1 Test Street" } },
    notes: { en: [{ type: "paragraph", text: "Lifecycle notes." }] },
    ...overrides,
  };
}

function jsonRequest(method: "POST" | "PATCH", body: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

async function requireRow<Row>(
  harness: ApiHarness,
  sql: string,
  ...params: unknown[]
): Promise<Row> {
  const row = await harness.db.events
    .prepare(sql)
    .bind(...params)
    .first<Row>();
  expect.assert(row !== null, `expected a D1 row for: ${sql}`);

  return row;
}

async function countRows(api: ApiHarness, table: string) {
  const row = await api.db.events
    .prepare(`SELECT COUNT(*) AS count FROM ${table}`)
    .first<{ count: number }>();
  expect.assert(row !== null, `expected a count for ${table}`);

  return row.count;
}

interface PublicDetailBody {
  data?: {
    event?: {
      id?: string;
      slug?: string;
      status?: string;
      title?: Record<string, string>;
      aliases?: string[];
      remainingTotal?: number | null;
    };
    ticketTypes?: {
      key: string;
      priceMinor: number;
      capacity: number | null;
      remaining: number | null;
    }[];
    form?: {
      formVersion?: number;
      customFields?: { key: string }[];
    } | null;
  };
}

async function publicDetail(api: ApiHarness, slug: string): Promise<PublicDetailBody> {
  const response = await api.request(`/api/events/${encodeURIComponent(slug)}`);
  expect(response.status).toBe(200);

  return (await response.json()) as PublicDetailBody;
}

test.beforeAll(async ({ api }) => {
  await api.signIn("admin@example.com");
  await api.enableTwoFactor("admin@example.com");
});

describe("admin create writes every child row to D1", () => {
  test("commits a new event with its slug claims, aliases, limits and ticket types", async ({
    api,
  }) => {
    const response = await api.request("/api/admin/events", jsonRequest("POST", createPayload()));
    const body = (await response.json()) as {
      data?: { event?: { id: string; slug: string } };
    };

    expect(response.status).toBe(201);
    expect(body.data?.event).toMatchObject({ slug: NEW_SLUG });

    const eventId = body.data?.event?.id;
    expect.assert(eventId !== undefined, "create response must carry the new event id");
    expect(eventId).toBe(await eventIdBySlug(api.db, NEW_SLUG));

    const row = await requireRow<
      Record<string, unknown> & {
        slug: string;
        event_type: string;
        edition_year: number;
        status: string;
        enabled: number;
        registration_open: number;
        title_json: string;
      }
    >(
      api,
      `SELECT slug, event_type, edition_year, status, enabled, registration_open,
              title_json, timezone, starts_at, ends_at, created_at, updated_at
       FROM events WHERE id = ?`,
      eventId,
    );
    expect(row).toMatchObject({
      slug: NEW_SLUG,
      event_type: "conference",
      edition_year: 2031,
      status: "upcoming",
      enabled: 1,
      registration_open: 1,
      timezone: "UTC",
      starts_at: "2031-05-01T10:00:00.000Z",
      ends_at: "2031-05-01T18:00:00.000Z",
    });
    expect(JSON.parse(row.title_json)).toEqual(TITLE);
    expect(typeof row.created_at).toBe("string");
    expect(typeof row.updated_at).toBe("string");

    const limits = await requireRow<{
      currency: string;
      max_tickets_per_registration: number;
      max_total_tickets: number;
    }>(
      api,
      "SELECT currency, max_tickets_per_registration, max_total_tickets FROM event_ticket_limits WHERE event_id = ?",
      eventId,
    );
    expect(limits).toEqual({
      currency: "CAD",
      max_tickets_per_registration: 6,
      max_total_tickets: 500,
    });

    // A published form version is written through its own endpoint, not by POST /events.
    const beforeForm = await api.db.events
      .prepare("SELECT COUNT(*) AS count FROM event_form_versions WHERE event_id = ?")
      .bind(eventId)
      .first<{ count: number }>();
    expect(beforeForm?.count).toBe(0);

    const formResponse = await api.request(
      `/api/admin/events/${eventId}/form-versions`,
      jsonRequest("POST", { version: 1, schema: PUBLISHED_SCHEMA, status: "published" }),
    );
    expect(formResponse.status).toBe(201);

    const formRow = await requireRow<{
      version: number;
      schema_json: string;
      status: string;
      published_at: string | null;
    }>(
      api,
      "SELECT version, schema_json, status, published_at FROM event_form_versions WHERE event_id = ? AND version = 1",
      eventId,
    );
    expect(formRow.status).toBe("published");
    expect(formRow.version).toBe(1);
    expect(formRow.published_at).not.toBeNull();
    expect(JSON.parse(formRow.schema_json)).toEqual(PUBLISHED_SCHEMA);
  });

  test.for(["general", "vip"])(
    "stores ticket type %s with the submitted key, label, price and capacity",
    async (key, { api }) => {
      const eventId = await eventIdBySlug(api.db, NEW_SLUG);
      const expected = ticketTypes().find((type) => type.key === key);
      expect.assert(expected !== undefined, `expected payload for ticket ${key}`);

      const row = await requireRow<{
        key: string;
        label_json: string;
        description_json: string;
        price_minor: number;
        capacity: number;
        active: number;
        sort_order: number;
      }>(
        api,
        `SELECT key, label_json, description_json, price_minor, capacity, active, sort_order
         FROM event_ticket_types WHERE event_id = ? AND key = ?`,
        eventId,
        key,
      );
      expect(row).toMatchObject({
        key: expected.key,
        price_minor: expected.priceMinor,
        capacity: expected.capacity,
        active: 1,
        sort_order: expected.sortOrder,
      });
      expect(JSON.parse(row.label_json)).toEqual(expected.label);
      expect(JSON.parse(row.description_json)).toEqual(expected.description);
    },
  );

  test.for([NEW_SLUG, ...NEW_ALIASES])(
    "registers slug claim %s pointing at the new event",
    async (slug, { api }) => {
      const eventId = await eventIdBySlug(api.db, NEW_SLUG);
      const row = await requireRow<{ slug: string; event_id: string }>(
        api,
        "SELECT slug, event_id FROM event_slug_claims WHERE slug = ?",
        slug,
      );

      expect(row).toEqual({ slug, event_id: eventId });
    },
  );

  test.for(NEW_ALIASES)("persists alias %s as its own D1 row", async (alias, { api }) => {
    const eventId = await eventIdBySlug(api.db, NEW_SLUG);
    const row = await requireRow<{ alias: string; event_id: string }>(
      api,
      "SELECT alias, event_id FROM event_aliases WHERE alias = ?",
      alias,
    );

    expect(row).toEqual({ alias, event_id: eventId });
  });
});

describe("public endpoints read the committed D1 state", () => {
  test("lists the new event with the slug and title stored in D1", async ({ api }) => {
    const row = await requireRow<{ slug: string; title_json: string }>(
      api,
      "SELECT slug, title_json FROM events WHERE slug = ?",
      NEW_SLUG,
    );
    const response = await api.request("/api/events");
    const body = (await response.json()) as {
      data?: { events?: { id?: string; slug?: string; title?: Record<string, string> }[] };
    };

    expect(response.status).toBe(200);
    const listed = body.data?.events?.find((event) => event.slug === NEW_SLUG);
    expect(listed).toMatchObject({
      slug: row.slug,
      title: JSON.parse(row.title_json) as unknown,
    });
  });

  test("serves detail built from the form-version and ticket-type rows", async ({ api }) => {
    const eventId = await eventIdBySlug(api.db, NEW_SLUG);
    const formRow = await requireRow<{ version: number }>(
      api,
      "SELECT version FROM event_form_versions WHERE event_id = ? AND status = 'published'",
      eventId,
    );
    const row = await requireRow<{ title_json: string }>(
      api,
      "SELECT title_json FROM events WHERE id = ?",
      eventId,
    );
    const body = await publicDetail(api, NEW_SLUG);

    expect(body.data?.event?.id).toBe(eventId);
    expect(body.data?.event?.slug).toBe(NEW_SLUG);
    expect(body.data?.event?.title).toEqual(JSON.parse(row.title_json));
    expect(body.data?.event?.aliases).toEqual([...NEW_ALIASES].toSorted());
    expect(body.data?.event?.remainingTotal).toBe(500);
    expect(body.data?.form?.formVersion).toBe(formRow.version);
    expect(body.data?.form?.customFields?.map((field) => field.key)).toContain("company");
  });

  test.for(["general", "vip"])(
    "public ticket type %s matches its D1 label, price and capacity",
    async (key, { api }) => {
      const eventId = await eventIdBySlug(api.db, NEW_SLUG);
      const expected = ticketTypes().find((type) => type.key === key);
      expect.assert(expected !== undefined, `expected payload for ticket ${key}`);

      const row = await requireRow<{
        label_json: string;
        price_minor: number;
        capacity: number;
      }>(
        api,
        "SELECT label_json, price_minor, capacity FROM event_ticket_types WHERE event_id = ? AND key = ?",
        eventId,
        key,
      );
      const detail = await publicDetail(api, NEW_SLUG);
      const publicTicket = detail.data?.ticketTypes?.find((type) => type.key === key);

      expect(JSON.parse(row.label_json)).toEqual(expected.label);
      expect(publicTicket).toMatchObject({
        key,
        label: expected.label,
        priceMinor: row.price_minor,
        capacity: row.capacity,
        remaining: row.capacity,
      });
      expect(publicTicket?.priceMinor).toBe(expected.priceMinor);
    },
  );

  test.for(NEW_ALIASES)("resolves alias %s to the same event id", async (alias, { api }) => {
    const eventId = await eventIdBySlug(api.db, NEW_SLUG);
    const body = await publicDetail(api, alias);

    expect(body.data?.event?.id).toBe(eventId);
    expect(body.data?.event?.slug).toBe(NEW_SLUG);
  });
});

describe("admin patch changes the events row and public detail", () => {
  test("updates title_json, status and updated_at, then serves the new title", async ({ api }) => {
    const eventId = await eventIdBySlug(api.db, NEW_SLUG);
    const before = await requireRow<{
      title_json: string;
      status: string;
      updated_at: string;
    }>(api, "SELECT title_json, status, updated_at FROM events WHERE id = ?", eventId);

    const newTitle = { en: "Renamed DB Flow Event 2031" };
    const response = await api.request(
      `/api/admin/events/${eventId}`,
      jsonRequest("PATCH", { title: newTitle, status: "active" }),
    );
    expect(response.status).toBe(200);

    const after = await requireRow<{ title_json: string; status: string; updated_at: string }>(
      api,
      "SELECT title_json, status, updated_at FROM events WHERE id = ?",
      eventId,
    );
    expect(JSON.parse(after.title_json)).toEqual(newTitle);
    expect(after.status).toBe("active");
    expect(after.status).not.toBe(before.status);
    expect(after.updated_at).not.toBe(before.updated_at);

    const detail = await publicDetail(api, NEW_SLUG);
    expect(detail.data?.event?.title).toEqual(newTitle);
    expect(detail.data?.event?.status).toBe("active");
  });
});

describe("form version changes are committed and immediately published", () => {
  test("a draft does not change what public detail serves", async ({ api }) => {
    const eventId = await eventIdBySlug(api.db, NEW_SLUG);
    const response = await api.request(
      `/api/admin/events/${eventId}/form-versions`,
      jsonRequest("POST", { version: 2, schema: REVISED_SCHEMA, status: "draft" }),
    );
    expect(response.status).toBe(201);

    const row = await requireRow<{
      version: number;
      status: string;
      published_at: string | null;
      schema_json: string;
    }>(
      api,
      "SELECT version, status, published_at, schema_json FROM event_form_versions WHERE event_id = ? AND version = 2",
      eventId,
    );
    expect(row).toMatchObject({ version: 2, status: "draft", published_at: null });
    expect(JSON.parse(row.schema_json)).toEqual(REVISED_SCHEMA);

    const detail = await publicDetail(api, NEW_SLUG);
    expect(detail.data?.form?.formVersion).toBe(1);
    expect(detail.data?.form?.customFields?.map((field) => field.key)).toContain("company");
  });

  test("publishing a new version archives the old one and serves the new schema", async ({
    api,
  }) => {
    const eventId = await eventIdBySlug(api.db, NEW_SLUG);
    const response = await api.request(
      `/api/admin/events/${eventId}/form-versions`,
      jsonRequest("POST", { version: 3, schema: REVISED_SCHEMA, status: "published" }),
    );
    expect(response.status).toBe(201);

    const published = await requireRow<{
      version: number;
      status: string;
      published_at: string | null;
      schema_json: string;
    }>(
      api,
      "SELECT version, status, published_at, schema_json FROM event_form_versions WHERE event_id = ? AND version = 3",
      eventId,
    );
    expect(published.status).toBe("published");
    expect(published.published_at).not.toBeNull();
    expect(JSON.parse(published.schema_json)).toEqual(REVISED_SCHEMA);

    const archived = await requireRow<{ status: string }>(
      api,
      "SELECT status FROM event_form_versions WHERE event_id = ? AND version = 1",
      eventId,
    );
    expect(archived.status).toBe("archived");

    const detail = await publicDetail(api, NEW_SLUG);
    expect(detail.data?.form?.formVersion).toBe(3);
    const customFieldKeys = detail.data?.form?.customFields?.map((field) => field.key) ?? [];
    expect(customFieldKeys).toContain("team");
    expect(customFieldKeys).not.toContain("company");
  });
});

describe("ticket capacity updates are committed and reflected publicly", () => {
  test("changes event_ticket_types.capacity and the public remaining count", async ({ api }) => {
    const eventId = await eventIdBySlug(api.db, NEW_SLUG);
    const original = await requireRow<{ capacity: number | null }>(
      api,
      "SELECT capacity FROM event_ticket_types WHERE event_id = ? AND key = 'general'",
      eventId,
    );
    onTestFinished(async () => {
      await api.db.events
        .prepare(
          "UPDATE event_ticket_types SET capacity = ? WHERE event_id = ? AND key = 'general'",
        )
        .bind(original.capacity, eventId)
        .run();
    });

    const response = await api.request(
      `/api/admin/events/${eventId}/ticket-types/general`,
      jsonRequest("PATCH", { capacity: 70 }),
    );
    expect(response.status).toBe(200);

    const row = await requireRow<{ capacity: number | null }>(
      api,
      "SELECT capacity FROM event_ticket_types WHERE event_id = ? AND key = 'general'",
      eventId,
    );
    expect(row.capacity).toBe(70);

    const detail = await publicDetail(api, NEW_SLUG);
    expect(detail.data?.ticketTypes?.find((type) => type.key === "general")).toMatchObject({
      capacity: 70,
      remaining: 70,
    });
  });
});

describe("a conflicting alias rolls the whole create batch back", () => {
  test("returns 409 and inserts no events, aliases or slug claims", async ({ api }) => {
    const counts = {
      events: await countRows(api, "events"),
      aliases: await countRows(api, "event_aliases"),
      claims: await countRows(api, "event_slug_claims"),
    };

    const response = await api.request(
      "/api/admin/events",
      jsonRequest(
        "POST",
        createPayload({
          slug: CONFLICT_SLUG,
          eventType: "workshop",
          editionYear: 2032,
          aliases: ["summer-picnic"],
        }),
      ),
    );
    const body = (await response.json()) as { error?: { code?: string } };

    expect(response.status).toBe(409);
    expect(body.error?.code).toBe("event_exists");
    expect(await countRows(api, "events")).toBe(counts.events);
    expect(await countRows(api, "event_aliases")).toBe(counts.aliases);
    expect(await countRows(api, "event_slug_claims")).toBe(counts.claims);
  });
});
