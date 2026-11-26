/* oxlint-disable typescript/no-unsafe-type-assertion -- API response bodies are asserted in tests. */
import { describe, expect, vi } from "vitest";

import { getTicketTypeRepository } from "~/platform/server/db/events";

import { test, type ApiHarness } from "./harness";

const MISSING_EVENT_ID = "00000000-0000-7000-8000-000000000000";

interface SuccessEnvelope<TData> {
  status: "success";
  data: TData;
}

interface ErrorEnvelope {
  status: "error";
  error: { code: string; fields?: string[] };
}

interface TicketTypeRecord {
  key: string;
  active: boolean;
  capacity: number | null;
  defaultQuantity: number;
  description: string | null;
  maxPerRegistration: number | null;
  ticketsSold: number;
}

type TicketOverrides = Record<string, unknown>;

interface PatchTicketTypeInput {
  eventId: string;
  key: string;
  payload: TicketOverrides;
}

async function seededEventId(api: ApiHarness, offset = 0) {
  const row = await api.db.events
    .prepare("SELECT id, slug FROM events ORDER BY slug LIMIT 1 OFFSET ?")
    .bind(offset)
    .first<{ id: string; slug: string }>();

  expect.assert(row !== null, "expected a seeded event");

  return row.id;
}

function ticketPayload(key: string, overrides: TicketOverrides = {}): TicketOverrides {
  return {
    key,
    label: { en: `Test ${key}` },
    priceMinor: 1000,
    minPerRegistration: 0,
    maxPerRegistration: 10,
    defaultQuantity: 1,
    capacity: 1000,
    active: false,
    sortOrder: 20,
    ...overrides,
  };
}

function postTicketType(
  api: ApiHarness,
  eventId: string,
  payload: TicketOverrides,
): Promise<Response> {
  return api.request(`/api/admin/events/${eventId}/ticket-types`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function patchTicketType(api: ApiHarness, input: PatchTicketTypeInput): Promise<Response> {
  return api.request(`/api/admin/events/${input.eventId}/ticket-types/${input.key}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input.payload),
  });
}

async function setPublishedFormSchema(api: ApiHarness, eventId: string, fields: unknown) {
  await api.db.events
    .prepare(
      "UPDATE event_form_versions SET schema_json = ?, status = 'published' WHERE event_id = ?",
    )
    .bind(JSON.stringify({ fields }), eventId)
    .run();
}

test.beforeAll(async ({ api }) => {
  await api.signIn("admin@example.com");
  await api.enableTwoFactor("admin@example.com");
});

describe("admin ticket types API", () => {
  test("lists the seeded event's ticket types", async ({ api }) => {
    const eventId = await seededEventId(api);
    const response = await api.request(`/api/admin/events/${eventId}/ticket-types`);
    const body = (await response.json()) as SuccessEnvelope<{ ticketTypes: TicketTypeRecord[] }>;

    expect(response.status).toBe(200);
    expect(body.data.ticketTypes.map((ticket) => ticket.key)).toContain("general");
    expect(body.data.ticketTypes.every((ticket) => ticket.active)).toBe(true);
  });

  test("returns 404 when listing ticket types for an unknown event", async ({ api }) => {
    const response = await api.request(`/api/admin/events/${MISSING_EVENT_ID}/ticket-types`);
    const body = (await response.json()) as ErrorEnvelope;

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("event_not_found");
  });

  test("creates a ticket type and normalizes omitted optionals", async ({ api }) => {
    const eventId = await seededEventId(api);
    const response = await postTicketType(api, eventId, {
      key: "created_simple",
      label: { en: "Created" },
      priceMinor: 500,
      minPerRegistration: 0,
      defaultQuantity: 1,
      active: false,
      sortOrder: 30,
    });
    const body = (await response.json()) as SuccessEnvelope<{ ticketType: TicketTypeRecord }>;

    expect(response.status).toBe(201);
    expect(body.data.ticketType).toMatchObject({
      key: "created_simple",
      description: null,
      maxPerRegistration: null,
      capacity: null,
      active: false,
    });
  });

  test("rejects a duplicate ticket type key", async ({ api }) => {
    const eventId = await seededEventId(api);
    const response = await postTicketType(api, eventId, ticketPayload("general"));
    const body = (await response.json()) as ErrorEnvelope;

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("event_ticket_type_exists");
  });

  const invalidTicketCases = [
    {
      title: "max below min",
      key: "invalid_max_below_min",
      overrides: { minPerRegistration: 5, maxPerRegistration: 2, defaultQuantity: 5 },
      fields: ["ticketTypes/0/maxPerRegistration", "ticketTypes/0/defaultQuantity"],
    },
    {
      title: "default below min",
      key: "invalid_default_below_min",
      overrides: { minPerRegistration: 5, defaultQuantity: 1 },
      fields: ["ticketTypes/0/defaultQuantity"],
    },
    {
      title: "default above max",
      key: "invalid_default_above_max",
      overrides: { maxPerRegistration: 2, defaultQuantity: 5 },
      fields: ["ticketTypes/0/defaultQuantity"],
    },
  ];

  test.for(invalidTicketCases)("rejects $title", async (ticketCase, { api }) => {
    const eventId = await seededEventId(api);
    const response = await postTicketType(
      api,
      eventId,
      ticketPayload(ticketCase.key, ticketCase.overrides),
    );
    const body = (await response.json()) as ErrorEnvelope;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("event_invalid_payload");
    expect(body.error.fields).toEqual(expect.arrayContaining(ticketCase.fields));
  });

  test("rejects a ticket type payload that fails schema validation", async ({ api }) => {
    const eventId = await seededEventId(api);
    const response = await postTicketType(api, eventId, { key: "INVALID KEY" });
    const body = (await response.json()) as ErrorEnvelope;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 404 when creating a ticket type for an unknown event", async ({ api }) => {
    const response = await postTicketType(api, MISSING_EVENT_ID, ticketPayload("orphan"));
    const body = (await response.json()) as ErrorEnvelope;

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("event_not_found");
  });

  test("returns 500 when ticket type creation fails unexpectedly", async ({ api }) => {
    const eventId = await seededEventId(api);
    vi.spyOn(getTicketTypeRepository(api.db.events), "create").mockRejectedValueOnce(
      new Error("insert failed"),
    );

    const response = await postTicketType(api, eventId, ticketPayload("create_failure"));
    const body = (await response.json()) as ErrorEnvelope;

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("event_ticket_type_create_failed");
  });
});

describe("admin ticket type updates", () => {
  test("updates every mutable ticket type field", async ({ api }) => {
    const eventId = await seededEventId(api);
    const response = await patchTicketType(api, {
      eventId,
      key: "vip",
      payload: {
        label: { en: "Updated VIP" },
        description: { en: "Updated description" },
        priceMinor: 7500,
        minPerRegistration: 1,
        maxPerRegistration: 8,
        defaultQuantity: 2,
        capacity: 500,
        active: true,
        sortOrder: 99,
      },
    });
    const body = (await response.json()) as SuccessEnvelope<{ ticketType: TicketTypeRecord }>;

    expect(response.status).toBe(200);
    expect(body.data.ticketType).toMatchObject({
      key: "vip",
      capacity: 500,
      defaultQuantity: 2,
    });
  });

  test("keeps existing values when the patch body is empty", async ({ api }) => {
    const eventId = await seededEventId(api);
    const response = await patchTicketType(api, { eventId, key: "volunteer", payload: {} });
    const body = (await response.json()) as SuccessEnvelope<{ ticketType: TicketTypeRecord }>;

    expect(response.status).toBe(200);
    expect(body.data.ticketType.key).toBe("volunteer");
  });

  test("rejects capacity below tickets already sold", async ({ api }) => {
    const eventId = await seededEventId(api);
    const stats = await api.db.events
      .prepare(
        "SELECT tickets_sold FROM ticket_type_stats WHERE event_id = ? AND ticket_type_key = ?",
      )
      .bind(eventId, "general")
      .first<{ tickets_sold: number }>();

    expect.assert(stats !== null, "expected ticket type stats for general");
    expect(stats.tickets_sold).toBeGreaterThan(0);

    const response = await patchTicketType(api, {
      eventId,
      key: "general",
      payload: { capacity: 0 },
    });
    const body = (await response.json()) as ErrorEnvelope;

    expect(response.status).toBe(400);
    expect(body.error.fields).toEqual(["capacity"]);
  });

  test("rejects activating a ticket type missing from the published form", async ({ api }) => {
    const eventId = await seededEventId(api);
    const created = await postTicketType(api, eventId, ticketPayload("form_missing"));

    expect(created.status).toBe(201);

    const response = await patchTicketType(api, {
      eventId,
      key: "form_missing",
      payload: { active: true },
    });
    const body = (await response.json()) as ErrorEnvelope;

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("event_form_update_required");
    expect(body.error.fields).toEqual(["active"]);
  });

  test("activates a ticket type after it was deactivated", async ({ api }) => {
    const eventId = await seededEventId(api);
    const deactivated = await patchTicketType(api, {
      eventId,
      key: "child",
      payload: { active: false },
    });

    expect(deactivated.status).toBe(200);

    const reactivated = await patchTicketType(api, {
      eventId,
      key: "child",
      payload: { active: true },
    });

    expect(reactivated.status).toBe(200);
  });

  test("rejects a merged ticket type that violates cross-field rules", async ({ api }) => {
    const eventId = await seededEventId(api);
    const response = await patchTicketType(api, {
      eventId,
      key: "child",
      payload: { minPerRegistration: 5 },
    });
    const body = (await response.json()) as ErrorEnvelope;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("event_invalid_payload");
    expect(body.error.fields).toEqual(
      expect.arrayContaining(["ticketTypes/0/maxPerRegistration", "ticketTypes/0/defaultQuantity"]),
    );
  });

  test("returns 404 when patching a ticket type on an unknown event", async ({ api }) => {
    const response = await patchTicketType(api, {
      eventId: MISSING_EVENT_ID,
      key: "general",
      payload: { active: false },
    });
    const body = (await response.json()) as ErrorEnvelope;

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("event_not_found");
  });

  test("returns 404 when patching an unknown ticket type", async ({ api }) => {
    const eventId = await seededEventId(api);
    const response = await patchTicketType(api, {
      eventId,
      key: "missing_key",
      payload: { active: false },
    });
    const body = (await response.json()) as ErrorEnvelope;

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("event_ticket_type_not_found");
  });

  test("returns 500 when ticket type update fails unexpectedly", async ({ api }) => {
    const eventId = await seededEventId(api);
    vi.spyOn(getTicketTypeRepository(api.db.events), "update").mockRejectedValueOnce(
      new Error("update failed"),
    );

    const response = await patchTicketType(api, {
      eventId,
      key: "volunteer",
      payload: { sortOrder: 7 },
    });
    const body = (await response.json()) as ErrorEnvelope;

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("event_ticket_type_update_failed");
  });

  test("ignores a published form whose field list is not an array", async ({ api }) => {
    const eventId = await seededEventId(api, 1);
    await setPublishedFormSchema(api, eventId, "not-an-array");
    const created = await postTicketType(api, eventId, ticketPayload("bad_fields_shape"));

    expect(created.status).toBe(201);

    const response = await patchTicketType(api, {
      eventId,
      key: "bad_fields_shape",
      payload: { active: true },
    });

    expect(response.status).toBe(409);
  });

  test("ignores published form fields that are not records", async ({ api }) => {
    const eventId = await seededEventId(api, 1);
    await setPublishedFormSchema(api, eventId, ["not-a-record"]);
    const created = await postTicketType(api, eventId, ticketPayload("bad_field_record"));

    expect(created.status).toBe(201);

    const response = await patchTicketType(api, {
      eventId,
      key: "bad_field_record",
      payload: { active: true },
    });

    expect(response.status).toBe(409);
  });

  test("activates a ticket type when the event has no published form", async ({ api }) => {
    const eventId = await seededEventId(api, 1);
    await api.db.events
      .prepare("UPDATE event_form_versions SET status = 'draft' WHERE event_id = ?")
      .bind(eventId)
      .run();
    const created = await postTicketType(api, eventId, ticketPayload("no_published_form"));

    expect(created.status).toBe(201);

    const response = await patchTicketType(api, {
      eventId,
      key: "no_published_form",
      payload: { active: true },
    });

    expect(response.status).toBe(200);
  });
});
