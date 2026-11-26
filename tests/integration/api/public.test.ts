/* oxlint-disable typescript/no-unsafe-type-assertion, typescript/no-unsafe-assignment, typescript/no-unsafe-call, typescript/no-unsafe-member-access, typescript/no-unsafe-return -- API response bodies and proxy test doubles are asserted here. */
import type { Context } from "hono";
import { describe, expect, onTestFinished } from "vitest";

import { registrationFailureResponse } from "~/features/events/server/api/registration-errors";
import {
  RegistrationFailureError,
  type RegistrationFailureCode,
} from "~/features/events/server/services/registration-service";

import type { TestDatabase } from "../helpers/d1";
import { parseJson } from "../helpers/http";
import { test } from "./harness";

const DETAIL_SLUG = "summer-picnic-2027";
const REGISTRATION_SLUG = "test-event-2027";

async function firstPublishedSlug(db: TestDatabase) {
  const row = await db.events
    .prepare("SELECT slug FROM events WHERE enabled = 1 LIMIT 1")
    .first<{ slug: string }>();

  return row?.slug ?? "";
}

async function eventIdBySlug(db: TestDatabase, slug: string) {
  const row = await db.events
    .prepare("SELECT id FROM events WHERE slug = ? LIMIT 1")
    .bind(slug)
    .first<{ id: string }>();

  return row?.id ?? "";
}

function registrationBody(
  email: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    fullName: "Test Person",
    contacts: [{ kind: "email", email, isConfirmation: true }],
    tickets: [{ key: "general", quantity: 1 }],
    consent: true,
    formVersion: 1,
    ...overrides,
  };
}

function postRegistration(
  api: {
    request: (path: string, init?: RequestInit) => Promise<Response>;
  },
  slug: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return api.request(`/api/events/${encodeURIComponent(slug)}/registrations`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-turnstile-token": "test-token" },
    body: JSON.stringify(body),
  });
}

interface PublicResponseBody {
  data?: {
    event?: { remainingTotal?: number | null; slug?: string };
    form?: unknown;
    ticketTypes?: { key: string; remaining?: number | null }[];
    registration?: { statusUrl?: string };
  };
  error?: { code?: string; fields?: string[]; issues?: unknown[] };
  meta?: { warnings?: { code: string }[] };
}

function responseBody(response: Response): Promise<PublicResponseBody> {
  return parseJson<PublicResponseBody>(response);
}

function fakeContext(): Context {
  return {
    json: (body: unknown, status?: number, headers?: Record<string, string>) =>
      Response.json(body, {
        ...(status === undefined ? {} : { status }),
        ...(headers === undefined ? {} : { headers }),
      }),
  } as unknown as Context;
}

describe("public events API", () => {
  test("lists public events with a cacheable response", async ({ api }) => {
    const response = await api.request("/api/events");
    const body = await responseBody(response);

    expect(response.status).toBe(200);
    expect(body.data?.event).toBeUndefined();
    expect(response.headers.get("cache-control")).toContain("max-age=60");
  });

  test("lists public events for a supported and unsupported locale", async ({ api }) => {
    const localized = await api.request("/api/events?locale=fr");
    const fallback = await api.request("/api/events?locale=zz");

    expect(localized.status).toBe(200);
    expect(fallback.status).toBe(200);
  });

  test("returns a published event detail", async ({ api }) => {
    const slug = await firstPublishedSlug(api.db);
    const response = await api.request(`/api/events/${encodeURIComponent(slug)}`);
    const body = await responseBody(response);

    expect(response.status).toBe(200);
    expect(body.data?.event?.slug).toBe(slug);
    expect(body.data?.form).toBeTruthy();
  });

  test("honours a supported locale and falls back for an unsupported one", async ({ api }) => {
    const localized = await api.request(`/api/events/${DETAIL_SLUG}?locale=fr`);
    const fallback = await api.request(`/api/events/${DETAIL_SLUG}?locale=zz`);
    const localizedBody = await responseBody(localized);
    const fallbackBody = await responseBody(fallback);

    expect(localized.status).toBe(200);
    expect(localizedBody.data?.form).toBeTruthy();
    expect(fallback.status).toBe(200);
    expect(fallbackBody.data?.form).toBeTruthy();
  });

  test("rejects an unknown detail query key before caching", async ({ api }) => {
    const response = await api.request(`/api/events/${DETAIL_SLUG}?unexpected=1`);

    expect(response.status).toBe(400);
  });

  test("returns 404 for an unknown slug", async ({ api }) => {
    const response = await api.request("/api/events/does-not-exist");

    expect(response.status).toBe(404);
  });

  test("reports null remaining values when capacity and total limits are unset", async ({
    api,
  }) => {
    const eventId = await eventIdBySlug(api.db, REGISTRATION_SLUG);
    const ticket = await api.db.events
      .prepare(
        "SELECT capacity FROM event_ticket_types WHERE event_id = ? AND key = 'general' LIMIT 1",
      )
      .bind(eventId)
      .first<{ capacity: number | null }>();
    const limits = await api.db.events
      .prepare("SELECT max_total_tickets FROM event_ticket_limits WHERE event_id = ? LIMIT 1")
      .bind(eventId)
      .first<{ max_total_tickets: number | null }>();

    try {
      await api.db.events
        .prepare(
          "UPDATE event_ticket_types SET capacity = NULL WHERE event_id = ? AND key = 'general'",
        )
        .bind(eventId)
        .run();
      await api.db.events
        .prepare("UPDATE event_ticket_limits SET max_total_tickets = NULL WHERE event_id = ?")
        .bind(eventId)
        .run();

      const response = await api.request(`/api/events/${REGISTRATION_SLUG}`);
      const body = await responseBody(response);

      expect(response.status).toBe(200);
      expect(body.data?.event?.remainingTotal).toBeNull();
      expect(
        body.data?.ticketTypes?.find((entry) => entry.key === "general")?.remaining,
      ).toBeNull();
    } finally {
      await api.db.events
        .prepare(
          "UPDATE event_ticket_types SET capacity = ? WHERE event_id = ? AND key = 'general'",
        )
        .bind(ticket?.capacity ?? 100, eventId)
        .run();
      await api.db.events
        .prepare("UPDATE event_ticket_limits SET max_total_tickets = ? WHERE event_id = ?")
        .bind(limits?.max_total_tickets ?? 75, eventId)
        .run();
    }
  });

  test("omits the registration form for missing, invalid, or inactive form data", async ({
    api,
  }) => {
    const eventId = await eventIdBySlug(api.db, REGISTRATION_SLUG);
    const form = await api.db.events
      .prepare("SELECT schema_json FROM event_form_versions WHERE event_id = ? AND version = 1")
      .bind(eventId)
      .first<{ schema_json: string }>();

    try {
      await api.db.events
        .prepare(
          "UPDATE event_form_versions SET status = 'archived' WHERE event_id = ? AND version = 1",
        )
        .bind(eventId)
        .run();
      const missing = await api.request(`/api/events/${REGISTRATION_SLUG}`);
      const missingBody = await responseBody(missing);

      expect(missingBody.data?.form).toBeNull();

      await api.db.events
        .prepare(
          "UPDATE event_form_versions SET status = 'published' WHERE event_id = ? AND version = 1",
        )
        .bind(eventId)
        .run();
      await api.db.events
        .prepare(
          "UPDATE event_form_versions SET schema_json = '{\"bad\":true}' WHERE event_id = ? AND version = 1",
        )
        .bind(eventId)
        .run();
      const invalid = await api.request(`/api/events/${REGISTRATION_SLUG}`);
      const invalidBody = await responseBody(invalid);

      expect(invalidBody.data?.form).toBeNull();

      await api.db.events
        .prepare(
          "UPDATE event_form_versions SET schema_json = ? WHERE event_id = ? AND version = 1",
        )
        .bind(form?.schema_json ?? "{}", eventId)
        .run();
      await api.db.events
        .prepare("UPDATE event_ticket_types SET active = 0 WHERE event_id = ?")
        .bind(eventId)
        .run();
      const inactive = await api.request(`/api/events/${REGISTRATION_SLUG}`);
      const inactiveBody = await responseBody(inactive);

      expect(inactiveBody.data?.form).toBeNull();
    } finally {
      await api.db.events
        .prepare(
          "UPDATE event_form_versions SET status = 'published', schema_json = ? WHERE event_id = ? AND version = 1",
        )
        .bind(form?.schema_json ?? "{}", eventId)
        .run();
      await api.db.events
        .prepare("UPDATE event_ticket_types SET active = 1 WHERE event_id = ?")
        .bind(eventId)
        .run();
    }
  });

  test("requires a Turnstile token for registration", async ({ api }) => {
    const slug = await firstPublishedSlug(api.db);
    const response = await api.request(`/api/events/${encodeURIComponent(slug)}/registrations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const body = await responseBody(response);

    expect(response.status).toBe(403);
    expect(body.error?.code).toBe("turnstile_required");
  });

  test("rejects an invalid registration body after Turnstile", async ({ api }) => {
    const slug = await firstPublishedSlug(api.db);
    const response = await api.request(`/api/events/${encodeURIComponent(slug)}/registrations`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-turnstile-token": "test-token" },
      body: JSON.stringify({ contacts: [] }),
    });

    expect(response.status).toBe(400);
  });

  test("returns 404 when registering for an unknown slug", async ({ api }) => {
    const response = await postRegistration(
      api,
      "does-not-exist",
      registrationBody("nobody@example.com"),
    );

    expect(response.status).toBe(404);
  });

  test("creates a registration and warns when the email is not queued", async ({ api }) => {
    const response = await postRegistration(
      api,
      REGISTRATION_SLUG,
      registrationBody("new-registration@example.com", { metadata: { locale: "fr" } }),
    );
    const body = await responseBody(response);

    expect(response.status).toBe(201);
    expect(body.data?.registration?.statusUrl).toContain("/api/events/status/link");
    expect(body.data?.registration?.statusUrl).toContain("locale=fr");
    expect(body.meta?.warnings?.[0]?.code).toBe("event_registration_email_not_queued");
  });

  test("reports emailQueued when the email transport is configured", async ({ api }) => {
    const keys = [
      "MAILTRAP_API_URL",
      "MAILTRAP_API_TOKEN",
      "MAILTRAP_TEMPLATE_REGISTRATION_RECEIVED",
      "MAILTRAP_TEMPLATE_PAYMENT_CONFIRMED",
      "MAILTRAP_TEMPLATE_STATUS_OTP",
      "MAILTRAP_TEMPLATE_TWO_FACTOR_CODE",
    ] as const;
    const original = keys.map((key) => api.env[key]);
    onTestFinished(() => {
      for (const [index, key] of keys.entries()) {
        api.env[key] = original[index];
      }
    });

    api.env.MAILTRAP_API_URL = "https://mailtrap.test/send";
    api.env.MAILTRAP_API_TOKEN = "test-token";
    api.env.MAILTRAP_TEMPLATE_REGISTRATION_RECEIVED = "test-registration-template";
    api.env.MAILTRAP_TEMPLATE_PAYMENT_CONFIRMED = "test-payment-template";
    api.env.MAILTRAP_TEMPLATE_STATUS_OTP = "test-status-otp-template";
    api.env.MAILTRAP_TEMPLATE_TWO_FACTOR_CODE = "test-two-factor-template";

    const response = await postRegistration(
      api,
      REGISTRATION_SLUG,
      registrationBody("queued-email@example.com", { metadata: { locale: 42 } }),
    );
    const body = (await response.json()) as {
      data?: { emailQueued?: boolean; registration?: { statusUrl?: string } };
      meta?: { warnings?: unknown[] };
    };

    expect(response.status).toBe(201);
    expect(body.data?.emailQueued).toBe(true);
    expect(body.data?.registration?.statusUrl).toContain("/api/events/status/link");
    expect(body.data?.registration?.statusUrl).toContain("locale=en");
    expect(body.meta?.warnings).toBeUndefined();
  });

  test("accepts a phone-only payload and reports form issues", async ({ api }) => {
    const response = await postRegistration(api, REGISTRATION_SLUG, {
      fullName: "Phone Only",
      contacts: [{ kind: "phone", phone: "5065559999" }],
      tickets: [{ key: "general", quantity: 1 }],
      consent: true,
      formVersion: 1,
    });
    const body = await responseBody(response);

    expect(response.status).toBe(400);
    expect(body.error?.code).toBe("event_invalid_payload");
    expect(body.error?.issues?.length).toBeGreaterThan(0);
  });

  test("rate limits a registration email separately from the IP", async ({ api }) => {
    const original = api.env.EVENT_ENGINE_REGISTRATION_RATE_LIMITER;
    let calls = 0;

    try {
      api.env.EVENT_ENGINE_REGISTRATION_RATE_LIMITER = {
        limit: () => {
          calls += 1;
          return Promise.resolve({ success: calls === 1 });
        },
      };

      const response = await postRegistration(
        api,
        REGISTRATION_SLUG,
        registrationBody("email-limited@example.com"),
      );

      expect(response.status).toBe(429);
      expect(response.headers.get("retry-after")).toBe("60");
    } finally {
      api.env.EVENT_ENGINE_REGISTRATION_RATE_LIMITER = original;
    }
  });

  test("rate limits registration bursts", async ({ api }) => {
    const slug = await firstPublishedSlug(api.db);

    try {
      api.limiters.registration.allow = false;

      const response = await api.request(`/api/events/${encodeURIComponent(slug)}/registrations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(429);
    } finally {
      api.limiters.registration.allow = true;
    }
  });

  test("rejects a duplicate email registration", async ({ api }) => {
    const response = await postRegistration(
      api,
      REGISTRATION_SLUG,
      registrationBody("dorothy@example.com"),
    );
    const body = await responseBody(response);

    expect(response.status).toBe(409);
    expect(body.error?.code).toBe("event_duplicate_registration");
  });

  test("rejects registration when the event closed registration", async ({ api }) => {
    const eventId = await eventIdBySlug(api.db, REGISTRATION_SLUG);

    try {
      await api.db.events
        .prepare("UPDATE events SET registration_open = 0 WHERE id = ?")
        .bind(eventId)
        .run();

      const response = await postRegistration(
        api,
        REGISTRATION_SLUG,
        registrationBody("closed@example.com"),
      );
      const body = await responseBody(response);

      expect(response.status).toBe(409);
      expect(body.error?.code).toBe("event_registration_closed");
    } finally {
      await api.db.events
        .prepare("UPDATE events SET registration_open = 1 WHERE id = ?")
        .bind(eventId)
        .run();
    }
  });

  test("rejects registration when the event capacity is reached", async ({ api }) => {
    const eventId = await eventIdBySlug(api.db, REGISTRATION_SLUG);

    try {
      await api.db.events
        .prepare("UPDATE event_ticket_limits SET max_total_tickets = 0 WHERE event_id = ?")
        .bind(eventId)
        .run();

      const response = await postRegistration(
        api,
        REGISTRATION_SLUG,
        registrationBody("capacity@example.com"),
      );
      const body = await responseBody(response);

      expect(response.status).toBe(409);
      expect(body.error?.code).toBe("event_capacity_reached");
    } finally {
      await api.db.events
        .prepare("UPDATE event_ticket_limits SET max_total_tickets = 75 WHERE event_id = ?")
        .bind(eventId)
        .run();
    }
  });

  test("rejects registration when a ticket type is full", async ({ api }) => {
    const eventId = await eventIdBySlug(api.db, REGISTRATION_SLUG);

    try {
      await api.db.events
        .prepare(
          "UPDATE event_ticket_types SET capacity = 0 WHERE event_id = ? AND key = 'general'",
        )
        .bind(eventId)
        .run();

      const response = await postRegistration(
        api,
        REGISTRATION_SLUG,
        registrationBody("ticket-capacity@example.com"),
      );
      const body = await responseBody(response);

      expect(response.status).toBe(409);
      expect(body.error?.code).toBe("event_ticket_type_capacity_reached");
    } finally {
      await api.db.events
        .prepare(
          "UPDATE event_ticket_types SET capacity = 100 WHERE event_id = ? AND key = 'general'",
        )
        .bind(eventId)
        .run();
    }
  });

  test("rejects registration over the per-registration ticket limit", async ({ api }) => {
    const response = await postRegistration(
      api,
      REGISTRATION_SLUG,
      registrationBody("ticket-limit@example.com", {
        tickets: [{ key: "general", quantity: 5 }],
      }),
    );
    const body = await responseBody(response);

    expect(response.status).toBe(409);
    expect(body.error?.code).toBe("event_ticket_limit_reached");
  });

  test("rejects an unavailable ticket type", async ({ api }) => {
    const response = await postRegistration(
      api,
      REGISTRATION_SLUG,
      registrationBody("ticket-unavailable@example.com", {
        tickets: [{ key: "vip", quantity: 1 }],
      }),
    );
    const body = await responseBody(response);

    expect(response.status).toBe(409);
    expect(body.error?.code).toBe("event_ticket_type_unavailable");
  });

  test("rejects an empty ticket selection with field details", async ({ api }) => {
    const response = await postRegistration(
      api,
      REGISTRATION_SLUG,
      registrationBody("empty-tickets@example.com", {
        tickets: [{ key: "general", quantity: 0 }],
      }),
    );
    const body = await responseBody(response);

    expect(response.status).toBe(400);
    expect(body.error?.code).toBe("event_invalid_payload");
    expect(body.error?.fields).toEqual(["tickets"]);
  });

  test("rejects registration when no form version is published", async ({ api }) => {
    const eventId = await eventIdBySlug(api.db, REGISTRATION_SLUG);

    try {
      await api.db.events
        .prepare("UPDATE event_form_versions SET status = 'archived' WHERE event_id = ?")
        .bind(eventId)
        .run();

      const response = await postRegistration(
        api,
        REGISTRATION_SLUG,
        registrationBody("unavailable@example.com", { formVersion: null }),
      );
      const body = await responseBody(response);

      expect(response.status).toBe(409);
      expect(body.error?.code).toBe("event_unavailable");
    } finally {
      await api.db.events
        .prepare(
          "UPDATE event_form_versions SET status = 'published' WHERE event_id = ? AND version = 1",
        )
        .bind(eventId)
        .run();
    }
  });

  test("propagates unexpected registration errors", async ({ api }) => {
    const original = api.env.EVENT_ENGINE_DB;
    const proxy = new Proxy(original as object, {
      get(target, property) {
        if (property === "batch") {
          return () => Promise.reject(new Error("forced batch failure"));
        }

        const value = Reflect.get(target, property, target);

        return typeof value === "function" ? value.bind(target) : value;
      },
    });

    try {
      api.env.EVENT_ENGINE_DB = proxy;

      const response = await postRegistration(
        api,
        REGISTRATION_SLUG,
        registrationBody("unexpected@example.com"),
      );

      expect(response.status).toBe(500);
    } finally {
      api.env.EVENT_ENGINE_DB = original;
    }
  });
});

describe("registration failure responses", () => {
  const STATUS_BY_CODE: Record<RegistrationFailureCode, number> = {
    event_registration_closed: 409,
    event_unavailable: 409,
    event_duplicate_registration: 409,
    event_capacity_reached: 409,
    event_ticket_type_capacity_reached: 409,
    event_ticket_limit_reached: 409,
    event_ticket_type_unavailable: 409,
    event_invalid_form_version: 400,
    event_invalid_payload: 400,
    event_registration_failed: 500,
  };

  test("maps every failure code to its status", async () => {
    const results = await Promise.all(
      Object.entries(STATUS_BY_CODE).map(async ([code, status]) => {
        const response = registrationFailureResponse(
          fakeContext(),
          new RegistrationFailureError(code as RegistrationFailureCode),
        );
        const body = (await response.json()) as { error?: { code?: string } };

        return { code, status, body };
      }),
    );

    for (const { code, status, body } of results) {
      expect(status).toBe(STATUS_BY_CODE[code as RegistrationFailureCode]);
      expect(body.error?.code).toBe(code);
    }
  });

  test("includes optional field and issue details", async () => {
    const withFields = registrationFailureResponse(
      fakeContext(),
      new RegistrationFailureError("event_invalid_payload", { fields: ["tickets"] }),
    );
    const withIssues = registrationFailureResponse(
      fakeContext(),
      new RegistrationFailureError("event_invalid_payload", {
        issues: [{ ref: "custom.company", code: "required" }],
      }),
    );
    const fieldsBody = (await withFields.json()) as { error?: { fields?: string[] } };
    const issuesBody = (await withIssues.json()) as { error?: { issues?: unknown[] } };

    expect(fieldsBody.error?.fields).toEqual(["tickets"]);
    expect(issuesBody.error?.issues).toEqual([{ ref: "custom.company", code: "required" }]);
  });
});
