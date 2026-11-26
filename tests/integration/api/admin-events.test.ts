/* oxlint-disable typescript/no-unsafe-type-assertion -- API response bodies are asserted in tests. */
import { describe, expect, onTestFinished, vi } from "vitest";

import {
  getEventRepository,
  getRegistrationRepository,
} from "../../../src/platform/server/db/events";
import { eventIdBySlug } from "../helpers/events";
import { test, type ApiHarness } from "./harness";

const MISSING_EVENT_ID = "01900000-0000-7000-8000-000000000000";
const SUMMER_SLUG = "summer-picnic-2027";
const TEST_EVENT_SLUG = "test-event-2027";
const CREATED_SLUG = "admin-created-metadata-2030";

function jsonRequest(method: "POST" | "PATCH", body: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

async function formSchemaByVersion(
  api: ApiHarness,
  eventId: string,
  version: number,
): Promise<unknown> {
  const row = await api.db.events
    .prepare("SELECT schema_json FROM event_form_versions WHERE event_id = ? AND version = ?")
    .bind(eventId, version)
    .first<{ schema_json: string }>();
  expect.assert(row !== null, `expected form version ${version} for ${eventId}`);

  const parsed: unknown = JSON.parse(row.schema_json);

  return parsed;
}

/** A minimal schema that is structurally valid but not fully placed (warnings in draft mode). */
const INCOMPLETE_FORM_SCHEMA = {
  version: 4,
  contacts: {
    email: { required: true, width: "full", label: { en: "Email" } },
    phone: { required: false, width: "full", label: { en: "Phone" } },
    mail: { required: false, width: "full", label: { en: "Mail" } },
    confirmation: { mode: "optional", methods: ["email"] },
  },
  sections: [],
  fields: [],
};

interface TicketTypePayload {
  key: string;
  label: Record<string, string>;
  priceMinor: number;
  minPerRegistration: number;
  defaultQuantity: number;
  capacity: number;
  active: boolean;
  sortOrder: number;
}

function validTicketType(): TicketTypePayload {
  return {
    key: "general",
    label: { en: "General" },
    priceMinor: 1000,
    minPerRegistration: 0,
    defaultQuantity: 1,
    capacity: 100,
    active: true,
    sortOrder: 10,
  };
}

function createPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    slug: CREATED_SLUG,
    eventType: "conference",
    editionYear: 2030,
    title: { en: "Admin Created" },
    limits: { currency: "CAD" },
    ticketTypes: [validTicketType()],
    ...overrides,
  };
}

test.beforeAll(async ({ api }) => {
  await api.signIn("admin@example.com");
  await api.enableTwoFactor("admin@example.com");
});

describe("admin event list", () => {
  test("returns the admin role and the seeded events with pagination metadata", async ({ api }) => {
    const response = await api.request("/api/admin/events");
    const body = (await response.json()) as {
      data?: {
        role?: string;
        events?: { id: string; slug: string }[];
      };
      meta?: { pagination?: { page: number; pageSize: number; total: number; totalPages: number } };
    };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ status: "success" });
    expect(body.data?.role).toBe("admin");
    expect(body.data?.events?.length).toBeGreaterThan(0);
    expect(body.data?.events?.[0]).toHaveProperty("id");
    expect(body.meta?.pagination).toMatchObject({ page: 1, pageSize: 25 });
    expect(body.meta?.pagination?.totalPages).toBeGreaterThanOrEqual(1);
  });

  test.for(["0", "10001", "not-a-number"])(
    "rejects the out-of-range page query %s",
    async (page, { api }) => {
      const response = await api.request(`/api/admin/events?page=${encodeURIComponent(page)}`);

      expect(response.status).toBe(400);
    },
  );

  test("paginates events once more than one page of rows exists", async ({ api }) => {
    await api.db.events.batch(
      Array.from({ length: 26 }, (_, index) =>
        api.db.events
          .prepare(
            "INSERT INTO events (id, slug, event_type, edition_year, title_json) VALUES (?, ?, ?, ?, ?)",
          )
          .bind(
            `01900000-0000-7000-8000-${String(index + 1).padStart(12, "0")}`,
            `bulk-event-${index + 1}`,
            "bulk-event",
            2000 + index,
            JSON.stringify({ en: `Bulk event ${index + 1}` }),
          ),
      ),
    );

    const first = await api.request("/api/admin/events?page=1");
    const second = await api.request("/api/admin/events?page=2");
    const firstBody = (await first.json()) as {
      data?: { events?: { slug: string }[] };
      meta?: { pagination?: { page: number; total: number; totalPages: number } };
    };
    const secondBody = (await second.json()) as {
      data?: { events?: { slug: string }[] };
      meta?: { pagination?: { page: number; total: number; totalPages: number } };
    };

    expect(first.status).toBe(200);
    expect(firstBody.data?.events).toHaveLength(25);
    expect(firstBody.meta?.pagination).toMatchObject({ page: 1, totalPages: 2 });
    expect(second.status).toBe(200);
    expect(secondBody.data?.events?.length).toBeGreaterThan(0);
    expect(secondBody.meta?.pagination).toMatchObject({ page: 2, total: 28, totalPages: 2 });
    expect(secondBody.data?.events?.[0]?.slug).not.toBe(firstBody.data?.events?.[0]?.slug);
  });
});

describe("admin event creation", () => {
  test("creates a valid event and returns its detail", async ({ api }) => {
    const response = await api.request("/api/admin/events", jsonRequest("POST", createPayload()));
    const body = (await response.json()) as {
      data?: { event?: { id: string; slug: string; ticketTypes?: unknown[] } };
    };

    expect(response.status).toBe(201);
    expect(body.data?.event).toMatchObject({ slug: CREATED_SLUG });
    expect(body.data?.event?.id).toBe(await eventIdBySlug(api.db, CREATED_SLUG));
    expect(body.data?.event?.ticketTypes).toHaveLength(1);
  });

  test("rejects a payload that fails the ArkType schema", async ({ api }) => {
    const response = await api.request("/api/admin/events", jsonRequest("POST", { slug: "x" }));

    expect(response.status).toBe(400);
  });

  test("rejects cross-field formatting, locale, payment and alias errors", async ({ api }) => {
    const response = await api.request(
      "/api/admin/events",
      jsonRequest(
        "POST",
        createPayload({
          slug: "invalid-details-2030",
          timezone: "Not/AZone",
          limits: { currency: "ZZZ" },
          aliases: ["invalid-details-2030"],
          payments: { etransfer: { enabled: true } },
        }),
      ),
    );
    const body = (await response.json()) as { error?: { code?: string; fields?: string[] } };

    expect(response.status).toBe(400);
    expect(body.error).toMatchObject({ code: "event_invalid_payload" });
    expect(body.error?.fields).toEqual(
      expect.arrayContaining([
        "timezone",
        "limits.currency",
        "payments.etransfer.email",
        "aliases/0",
      ]),
    );
  });

  test("rejects contradictory ticket type quantities", async ({ api }) => {
    const payload = createPayload({
      slug: "invalid-tickets-2030",
      ticketTypes: [
        {
          ...validTicketType(),
          minPerRegistration: 2,
          maxPerRegistration: 1,
          defaultQuantity: 1,
        },
      ],
    });
    const response = await api.request("/api/admin/events", jsonRequest("POST", payload));
    const body = (await response.json()) as { error?: { code?: string; fields?: string[] } };

    expect(response.status).toBe(400);
    expect(body.error?.fields).toEqual(
      expect.arrayContaining(["ticketTypes/0/maxPerRegistration", "ticketTypes/0/defaultQuantity"]),
    );
  });

  test("maps a slug conflict to the event_exists error", async ({ api }) => {
    const response = await api.request("/api/admin/events", jsonRequest("POST", createPayload()));
    const body = (await response.json()) as { error?: { code?: string } };

    expect(response.status).toBe(409);
    expect(body.error?.code).toBe("event_exists");
  });

  test("maps an unexpected database failure to event_create_failed", async ({ api }) => {
    const response = await api.request(
      "/api/admin/events",
      jsonRequest(
        "POST",
        createPayload({
          slug: "inverted-dates-2030",
          eventType: "workshop",
          editionYear: 2031,
          startsAt: "2031-06-02T00:00:00.000Z",
          endsAt: "2031-06-01T00:00:00.000Z",
        }),
      ),
    );
    const body = (await response.json()) as { error?: { code?: string } };

    expect(response.status).toBe(500);
    expect(body.error?.code).toBe("event_create_failed");
  });
});

describe("admin event detail and lifecycle update", () => {
  test("reads the full detail of a seeded event", async ({ api }) => {
    const eventId = await eventIdBySlug(api.db, SUMMER_SLUG);
    const response = await api.request(`/api/admin/events/${eventId}`);
    const body = (await response.json()) as { data?: { event?: { id: string; slug: string } } };

    expect(response.status).toBe(200);
    expect(body.data?.event).toMatchObject({ id: eventId, slug: SUMMER_SLUG });
  });

  test("returns not_found for a well-formed but unknown event id", async ({ api }) => {
    const response = await api.request(`/api/admin/events/${MISSING_EVENT_ID}`);
    const body = (await response.json()) as { error?: { code?: string } };

    expect(response.status).toBe(404);
    expect(body.error?.code).toBe("event_not_found");
  });

  test("rejects an event id that is not a UUIDv7", async ({ api }) => {
    const response = await api.request("/api/admin/events/not-a-uuid");

    expect(response.status).toBe(400);
  });

  test("returns not_found when updating an unknown event", async ({ api }) => {
    const response = await api.request(
      `/api/admin/events/${MISSING_EVENT_ID}`,
      jsonRequest("PATCH", {}),
    );

    expect(response.status).toBe(404);
  });

  test("rejects an update whose end date precedes its start date", async ({ api }) => {
    const eventId = await eventIdBySlug(api.db, CREATED_SLUG);
    const response = await api.request(
      `/api/admin/events/${eventId}`,
      jsonRequest("PATCH", {
        startsAt: "2030-06-02T00:00:00.000Z",
        endsAt: "2030-06-01T00:00:00.000Z",
      }),
    );
    const body = (await response.json()) as { error?: { code?: string; fields?: string[] } };

    expect(response.status).toBe(400);
    expect(body.error).toMatchObject({
      code: "event_invalid_payload",
      fields: ["startsAt", "endsAt"],
    });
  });

  test("rejects an update with an invalid timezone", async ({ api }) => {
    const eventId = await eventIdBySlug(api.db, CREATED_SLUG);
    const response = await api.request(
      `/api/admin/events/${eventId}`,
      jsonRequest("PATCH", { timezone: "Not/AZone" }),
    );
    const body = (await response.json()) as { error?: { code?: string; fields?: string[] } };

    expect(response.status).toBe(400);
    expect(body.error?.fields).toContain("timezone");
  });

  test("updates event metadata with a valid patch", async ({ api }) => {
    const eventId = await eventIdBySlug(api.db, CREATED_SLUG);
    const response = await api.request(
      `/api/admin/events/${eventId}`,
      jsonRequest("PATCH", { title: { en: "Renamed Admin Created" }, status: "upcoming" }),
    );
    const body = (await response.json()) as {
      data?: { event?: { title?: Record<string, string>; status?: string } };
    };

    expect(response.status).toBe(200);
    expect(body.data?.event).toMatchObject({
      title: { en: "Renamed Admin Created" },
      status: "upcoming",
    });
  });

  test("maps an alias that claims another event's slug to event_exists", async ({ api }) => {
    const eventId = await eventIdBySlug(api.db, CREATED_SLUG);
    const response = await api.request(
      `/api/admin/events/${eventId}`,
      jsonRequest("PATCH", { aliases: [SUMMER_SLUG] }),
    );
    const body = (await response.json()) as { error?: { code?: string } };

    expect(response.status).toBe(409);
    expect(body.error?.code).toBe("event_exists");
  });
});

describe("admin event title and activity", () => {
  test("returns the compact title projection for a seeded event", async ({ api }) => {
    const eventId = await eventIdBySlug(api.db, SUMMER_SLUG);
    const response = await api.request(`/api/admin/events/${eventId}/title`);
    const body = (await response.json()) as {
      data?: { event?: { id: string; slug: string; defaultLocale: string; title: unknown } };
    };

    expect(response.status).toBe(200);
    expect(body.data?.event).toMatchObject({
      id: eventId,
      slug: SUMMER_SLUG,
      defaultLocale: "en",
    });
    expect(body.data?.event).toHaveProperty("title");
    expect(Object.keys(body.data?.event ?? {})).toHaveLength(4);
  });

  test("returns not_found from the title endpoint for an unknown event", async ({ api }) => {
    const response = await api.request(`/api/admin/events/${MISSING_EVENT_ID}/title`);

    expect(response.status).toBe(404);
  });

  test("returns the event together with its audit activity", async ({ api }) => {
    const eventId = await eventIdBySlug(api.db, SUMMER_SLUG);
    const response = await api.request(`/api/admin/events/${eventId}/activity`);
    const body = (await response.json()) as {
      data?: { event?: { id: string }; activity?: unknown[] };
    };

    expect(response.status).toBe(200);
    expect(body.data?.event?.id).toBe(eventId);
    expect(Array.isArray(body.data?.activity)).toBe(true);
  });

  test("returns not_found from the activity endpoint for an unknown event", async ({ api }) => {
    const response = await api.request(`/api/admin/events/${MISSING_EVENT_ID}/activity`);

    expect(response.status).toBe(404);
  });
});

describe("admin event overview", () => {
  test("returns registrations, checkins and form versions for an admin", async ({ api }) => {
    const eventId = await eventIdBySlug(api.db, SUMMER_SLUG);
    const response = await api.request(`/api/admin/events/${eventId}/overview`);
    const body = (await response.json()) as {
      data?: {
        role?: string;
        event?: { id: string };
        registrations?: unknown[];
        checkins?: unknown[];
        formVersions?: { version: number }[];
      };
    };

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ role: "admin" });
    expect(body.data?.event?.id).toBe(eventId);
    expect(Array.isArray(body.data?.registrations)).toBe(true);
    expect(Array.isArray(body.data?.checkins)).toBe(true);
    expect(body.data?.formVersions?.length).toBeGreaterThan(0);
  });

  test("returns not_found from the overview endpoint for an unknown event", async ({ api }) => {
    const response = await api.request(`/api/admin/events/${MISSING_EVENT_ID}/overview`);

    expect(response.status).toBe(404);
  });
});

describe("admin event form versions", () => {
  test("lists the seeded form versions of an event", async ({ api }) => {
    const eventId = await eventIdBySlug(api.db, SUMMER_SLUG);
    const response = await api.request(`/api/admin/events/${eventId}/form-versions`);
    const body = (await response.json()) as {
      data?: { event?: { id: string }; formVersions?: { version: number; schema: unknown }[] };
    };

    expect(response.status).toBe(200);
    expect(body.data?.event?.id).toBe(eventId);
    expect(body.data?.formVersions?.some((version) => version.version === 1)).toBe(true);
    expect(body.data?.formVersions?.[0]).toHaveProperty("schema");
  });

  test("returns not_found when listing form versions of an unknown event", async ({ api }) => {
    const response = await api.request(`/api/admin/events/${MISSING_EVENT_ID}/form-versions`);

    expect(response.status).toBe(404);
  });

  test("returns not_found when creating a form version for an unknown event", async ({ api }) => {
    const response = await api.request(
      `/api/admin/events/${MISSING_EVENT_ID}/form-versions`,
      jsonRequest("POST", { version: 2, schema: INCOMPLETE_FORM_SCHEMA, status: "draft" }),
    );

    expect(response.status).toBe(404);
  });

  test("rejects a malformed form schema with validation issues", async ({ api }) => {
    const eventId = await eventIdBySlug(api.db, SUMMER_SLUG);
    const response = await api.request(
      `/api/admin/events/${eventId}/form-versions`,
      jsonRequest("POST", { version: 900, schema: {}, status: "draft" }),
    );
    const body = (await response.json()) as {
      error?: { code?: string; fields?: string[]; issues?: unknown[] };
    };

    expect(response.status).toBe(400);
    expect(body.error?.code).toBe("event_invalid_form_schema");
    expect(body.error?.fields).toEqual(expect.arrayContaining(["contacts", "fields"]));
    expect(body.error?.issues?.length).toBeGreaterThan(0);
  });

  test("creates an incomplete draft and reports validation warnings", async ({ api }) => {
    const eventId = await eventIdBySlug(api.db, TEST_EVENT_SLUG);
    const response = await api.request(
      `/api/admin/events/${eventId}/form-versions`,
      jsonRequest("POST", { version: 2, schema: INCOMPLETE_FORM_SCHEMA, status: "draft" }),
    );
    const body = (await response.json()) as {
      data?: { formVersion?: { version: number; status: string } };
      meta?: { warnings?: unknown[] };
    };

    expect(response.status).toBe(201);
    expect(body.data?.formVersion).toMatchObject({ version: 2, status: "draft" });
    expect(body.meta?.warnings?.length).toBeGreaterThan(0);
  });

  test("creates a fully placed published form version", async ({ api }) => {
    const eventId = await eventIdBySlug(api.db, SUMMER_SLUG);
    const schema = await formSchemaByVersion(api, eventId, 1);
    const response = await api.request(
      `/api/admin/events/${eventId}/form-versions`,
      jsonRequest("POST", { version: 2, schema, status: "published" }),
    );
    const body = (await response.json()) as {
      data?: { formVersion?: { version: number; status: string; publishedAt?: string | null } };
      meta?: { warnings?: unknown[] };
    };

    expect(response.status).toBe(201);
    expect(body.data?.formVersion).toMatchObject({ version: 2, status: "published" });
    expect(body.data?.formVersion?.publishedAt).not.toBeNull();
    expect(body.meta?.warnings).toEqual([]);
  });

  test("maps a duplicate version number to event_form_version_exists", async ({ api }) => {
    const eventId = await eventIdBySlug(api.db, SUMMER_SLUG);
    const schema = await formSchemaByVersion(api, eventId, 2);
    const response = await api.request(
      `/api/admin/events/${eventId}/form-versions`,
      jsonRequest("POST", { version: 2, schema, status: "published" }),
    );
    const body = (await response.json()) as { error?: { code?: string } };

    expect(response.status).toBe(409);
    expect(body.error?.code).toBe("event_form_version_exists");
  });

  test("maps an unexpected database failure to event_form_version_create_failed", async ({
    api,
  }) => {
    const eventId = await eventIdBySlug(api.db, TEST_EVENT_SLUG);
    const oversizedSchema = { ...INCOMPLETE_FORM_SCHEMA, oversized: "x".repeat(70_000) };
    const response = await api.request(
      `/api/admin/events/${eventId}/form-versions`,
      jsonRequest("POST", { version: 997, schema: oversizedSchema, status: "draft" }),
    );
    const body = (await response.json()) as { error?: { code?: string } };

    expect(response.status).toBe(500);
    expect(body.error?.code).toBe("event_form_version_create_failed");
  });
});

describe("admin event preview", () => {
  test("previews the published form version with the event default locale", async ({ api }) => {
    const eventId = await eventIdBySlug(api.db, SUMMER_SLUG);
    const response = await api.request(`/api/admin/events/${eventId}/preview`);
    const body = (await response.json()) as {
      data?: { form?: { locale: string; formVersion: number; event?: { id: string } } };
    };

    expect(response.status).toBe(200);
    expect(body.data?.form).toMatchObject({ locale: "en", formVersion: 2 });
    expect(body.data?.form).toHaveProperty("event");
  });

  test("previews an explicitly requested version in a supported locale", async ({ api }) => {
    const eventId = await eventIdBySlug(api.db, SUMMER_SLUG);
    const response = await api.request(`/api/admin/events/${eventId}/preview?version=1&locale=fr`);
    const body = (await response.json()) as {
      data?: { form?: { locale: string; formVersion: number } };
    };

    expect(response.status).toBe(200);
    expect(body.data?.form).toMatchObject({ locale: "fr", formVersion: 1 });
  });

  test("falls back to the default locale for an unsupported locale", async ({ api }) => {
    const eventId = await eventIdBySlug(api.db, SUMMER_SLUG);
    const response = await api.request(`/api/admin/events/${eventId}/preview?locale=zz`);
    const body = (await response.json()) as { data?: { form?: { locale: string } } };

    expect(response.status).toBe(200);
    expect(body.data?.form?.locale).toBe("en");
  });

  test.for(["0", "abc"])("rejects the invalid preview version %s", async (version, { api }) => {
    const eventId = await eventIdBySlug(api.db, SUMMER_SLUG);
    const response = await api.request(
      `/api/admin/events/${eventId}/preview?version=${encodeURIComponent(version)}`,
    );

    expect(response.status).toBe(400);
  });

  test("returns not_found when the requested form version does not exist", async ({ api }) => {
    const eventId = await eventIdBySlug(api.db, SUMMER_SLUG);
    const response = await api.request(`/api/admin/events/${eventId}/preview?version=999`);

    expect(response.status).toBe(404);
  });

  test("returns invalid_form_schema when a form version holds an unparsable schema", async ({
    api,
  }) => {
    const eventId = await eventIdBySlug(api.db, TEST_EVENT_SLUG);
    await api.db.events
      .prepare(
        "INSERT INTO event_form_versions (event_id, version, schema_json, status) VALUES (?, ?, ?, ?)",
      )
      .bind(eventId, 998, "{}", "draft")
      .run();

    const response = await api.request(`/api/admin/events/${eventId}/preview?version=998`);
    const body = (await response.json()) as { error?: { code?: string } };

    expect(response.status).toBe(400);
    expect(body.error?.code).toBe("event_invalid_form_schema");
  });

  test("returns not_found when previewing an unknown event", async ({ api }) => {
    const response = await api.request(`/api/admin/events/${MISSING_EVENT_ID}/preview`);

    expect(response.status).toBe(404);
  });
});

describe("admin event support", () => {
  test("returns registrations with default filters and keyset pagination", async ({ api }) => {
    const eventId = await eventIdBySlug(api.db, SUMMER_SLUG);
    const response = await api.request(`/api/admin/events/${eventId}/support`);
    const body = (await response.json()) as {
      data?: {
        event?: { id: string };
        registrations?: unknown[];
        payments?: unknown[];
        checkins?: unknown[];
        filters?: { query: string; payment: string | null; checkin: string | null };
      };
      meta?: {
        keyset?: {
          pageSize: number;
          hasNext: boolean;
          hasPrev: boolean;
          nextCursor: string | null;
          prevCursor: string | null;
        };
      };
    };

    expect(response.status).toBe(200);
    expect(body.data?.event?.id).toBe(eventId);
    expect(body.data?.filters).toMatchObject({ query: "", payment: null, checkin: null });
    expect(Array.isArray(body.data?.registrations)).toBe(true);
    expect(body.data?.registrations?.length).toBeGreaterThan(0);
    expect(Array.isArray(body.data?.payments)).toBe(true);
    expect(Array.isArray(body.data?.checkins)).toBe(true);
    expect(body.meta?.keyset).toMatchObject({ pageSize: 25, hasPrev: false });
    expect(body.meta?.keyset?.nextCursor).not.toBeNull();
    expect(body.meta?.keyset?.prevCursor).not.toBeNull();
  });

  test("trims and applies search, payment and checkin filters", async ({ api }) => {
    const eventId = await eventIdBySlug(api.db, SUMMER_SLUG);
    const response = await api.request(
      `/api/admin/events/${eventId}/support?q=%20alice%20&payment=paid&checkin=checked_in`,
    );
    const body = (await response.json()) as {
      data?: { filters?: { query: string; payment: string | null; checkin: string | null } };
    };

    expect(response.status).toBe(200);
    expect(body.data?.filters).toMatchObject({
      query: "alice",
      payment: "paid",
      checkin: "checked_in",
    });
  });

  test.for(["5065550105", "+1 506 555 0105", "(506) 555-0105", "5550105"])(
    "finds a registration by phone number (%s)",
    async (query, { api }) => {
      const eventId = await eventIdBySlug(api.db, SUMMER_SLUG);
      const response = await api.request(
        `/api/admin/events/${eventId}/support?q=${encodeURIComponent(query)}`,
      );
      const body = (await response.json()) as {
        data?: { registrations?: { fullName: string }[] };
      };

      expect(response.status).toBe(200);
      expect(body.data?.registrations?.map((registration) => registration.fullName)).toEqual([
        "Mary Jackson",
      ]);
    },
  );

  test("returns mapped registration summaries when a payment filter matches", async ({ api }) => {
    const eventId = await eventIdBySlug(api.db, SUMMER_SLUG);
    const response = await api.request(`/api/admin/events/${eventId}/support?payment=unpaid`);
    const body = (await response.json()) as {
      data?: { registrations?: { id: string; fullName: string }[] };
      meta?: { keyset?: { hasNext: boolean } };
    };

    expect(response.status).toBe(200);
    expect(body.data?.registrations?.length).toBeGreaterThan(0);
    expect(body.data?.registrations?.[0]).toHaveProperty("id");
    expect(typeof body.meta?.keyset?.hasNext).toBe("boolean");
  });

  test("reports no cursor when a search matches no registrations", async ({ api }) => {
    const eventId = await eventIdBySlug(api.db, SUMMER_SLUG);
    const response = await api.request(
      `/api/admin/events/${eventId}/support?q=nonexistent-person-xyz`,
    );
    const body = (await response.json()) as {
      data?: { registrations?: unknown[] };
      meta?: {
        keyset?: {
          hasNext: boolean;
          hasPrev: boolean;
          nextCursor: string | null;
          prevCursor: string | null;
        };
      };
    };

    expect(response.status).toBe(200);
    expect(body.data?.registrations).toEqual([]);
    expect(body.meta?.keyset).toMatchObject({
      hasNext: false,
      hasPrev: false,
      nextCursor: null,
      prevCursor: null,
    });
  });

  test.for(["payment=unknown", "checkin=unknown", "before=", "after=not-a-cursor"])(
    "rejects the invalid support query %s",
    async (query, { api }) => {
      const eventId = await eventIdBySlug(api.db, SUMMER_SLUG);
      const response = await api.request(`/api/admin/events/${eventId}/support?${query}`);

      expect(response.status).toBe(400);
    },
  );

  test("pages registrations forward and backward with keyset cursors", async ({ api }) => {
    const eventId = await eventIdBySlug(api.db, SUMMER_SLUG);
    const repository = getRegistrationRepository(api.db.events);

    const first = await repository.searchByEvent(eventId, { limit: 2 });
    expect(first.registrations).toHaveLength(2);
    expect(first.hasNext).toBe(true);
    expect(first.hasPrev).toBe(false);
    expect(first.nextCursor).not.toBeNull();

    const second = await repository.searchByEvent(eventId, {
      limit: 2,
      after: first.nextCursor ?? undefined,
    });
    expect(second.registrations).toHaveLength(2);
    expect(second.hasPrev).toBe(true);
    expect(second.registrations.map((row) => row.id)).not.toEqual(
      first.registrations.map((row) => row.id),
    );

    const back = await repository.searchByEvent(eventId, {
      limit: 2,
      before: second.prevCursor ?? undefined,
    });
    expect(back.registrations.map((row) => row.id)).toEqual(
      first.registrations.map((row) => row.id),
    );
  });

  test("returns not_found when supporting an unknown event", async ({ api }) => {
    const response = await api.request(`/api/admin/events/${MISSING_EVENT_ID}/support`);

    expect(response.status).toBe(404);
  });
});

describe("admin registration detail", () => {
  test("returns the full registration with custom answers and form schema", async ({ api }) => {
    const eventId = await eventIdBySlug(api.db, SUMMER_SLUG);
    const row = await api.db.events
      .prepare(
        "SELECT r.id FROM registrations AS r JOIN registration_field_values AS v ON v.registration_id = r.id WHERE r.event_id = ? LIMIT 1",
      )
      .bind(eventId)
      .first<{ id: string }>();
    expect.assert(row !== null, "expected a seeded registration with answers");

    const response = await api.request(`/api/admin/events/${eventId}/registrations/${row.id}`);
    const body = (await response.json()) as {
      data?: {
        event?: { id: string };
        registration?: {
          id: string;
          fullName: string;
          answers: Record<string, unknown>;
          contacts: unknown[];
          tickets: unknown[];
        };
        answerFields?: { key: string; label: Record<string, string>; type: string }[];
        amountDue?: number;
        payment?: unknown;
        checkin?: unknown;
      };
    };

    expect(response.status).toBe(200);
    expect(body.data?.event?.id).toBe(eventId);
    expect(body.data?.registration?.id).toBe(row.id);
    expect(body.data?.registration?.fullName).toEqual(expect.any(String));
    expect(Object.keys(body.data?.registration?.answers ?? {}).length).toBeGreaterThan(0);
    expect(body.data?.registration?.contacts).toEqual(expect.any(Array));
    expect(body.data?.registration?.tickets).toEqual(expect.any(Array));
    expect(body.data?.answerFields).toEqual(expect.any(Array));
    expect(body.data?.answerFields?.length).toBeGreaterThan(0);
    expect(typeof body.data?.amountDue).toBe("number");
  });

  test("returns not_found for a registration in another event", async ({ api }) => {
    const eventId = await eventIdBySlug(api.db, SUMMER_SLUG);
    const otherEventId = await eventIdBySlug(api.db, TEST_EVENT_SLUG);
    const row = await api.db.events
      .prepare("SELECT id FROM registrations WHERE event_id = ? LIMIT 1")
      .bind(otherEventId)
      .first<{ id: string }>();
    expect.assert(row !== null, "expected a seeded registration");

    const response = await api.request(`/api/admin/events/${eventId}/registrations/${row.id}`);

    expect(response.status).toBe(404);
  });
});

// Runs last: switching the shared file-scoped session to staff cannot be undone
// without completing the 2FA flow again.
describe("admin event update repository failures", () => {
  test("returns a not-found envelope when the update reports a vanished event", async ({ api }) => {
    const eventId = await eventIdBySlug(api.db, CREATED_SLUG);
    const repository = getEventRepository(api.db.events);
    const update = vi.spyOn(repository, "update").mockResolvedValueOnce(null);
    onTestFinished(() => {
      update.mockRestore();
    });

    const response = await api.request(`/api/admin/events/${eventId}`, jsonRequest("PATCH", {}));
    const body = (await response.json()) as { error?: { code?: string } };

    expect(response.status).toBe(404);
    expect(body.error?.code).toBe("event_not_found");
    expect(update).toHaveBeenCalledOnce();
  });

  test("returns event_update_failed for a non-conflict database error", async ({ api }) => {
    const eventId = await eventIdBySlug(api.db, CREATED_SLUG);
    const repository = getEventRepository(api.db.events);
    const update = vi
      .spyOn(repository, "update")
      .mockRejectedValueOnce(new Error("unexpected database failure"));
    onTestFinished(() => {
      update.mockRestore();
    });

    const response = await api.request(
      `/api/admin/events/${eventId}`,
      jsonRequest("PATCH", { title: { en: "Should Not Persist" } }),
    );
    const body = (await response.json()) as { error?: { code?: string } };

    expect(response.status).toBe(500);
    expect(body.error?.code).toBe("event_update_failed");
  });
});

describe("admin event overview for a limited role", () => {
  test("omits form versions for a role that cannot read them", async ({ api }) => {
    const eventId = await eventIdBySlug(api.db, SUMMER_SLUG);

    await api.signIn("staff@example.com");
    await api.enableTwoFactor("staff@example.com");

    const response = await api.request(`/api/admin/events/${eventId}/overview`);
    const body = (await response.json()) as {
      data?: { role?: string; formVersions?: unknown[] };
    };

    expect(response.status).toBe(200);
    expect(body.data?.role).toBe("event_staff");
    expect(body.data?.formVersions).toEqual([]);
  });
});
