import { afterAll, beforeAll, expect } from "vitest";

import { createApiHarness, type ApiHarness } from "../harness";
import {
  apiJsonBody,
  expectApiResponse,
  expectNoWrites,
  fc,
  fcTest,
  FUZZ_PARAMS,
  fuzzInit,
  idSegment,
  pathSegment,
  query,
  seededIdFrom,
  snapshotCounts,
  withQuery,
} from "./toolkit";

/** Tables whose row counts must not change when a fuzzed mutation is rejected. */
const WATCHED_TABLES = [
  "events",
  "registrations",
  "event_ticket_types",
  "checkins",
  "payments",
] as const;

let api: ApiHarness;

// Populated in beforeAll; the arbitraries below capture the array reference and
// read it at generation time, so real seeded ids join the hostile segments.
const seededEventIds: string[] = [];
const seededRegistrationIds: string[] = [];

const anyEventId = fc.oneof(idSegment, seededIdFrom(seededEventIds));
const anyRegistrationId = fc.oneof(idSegment, seededIdFrom(seededRegistrationIds));
const anyTicketKey = fc.oneof(fc.constantFrom("general", "vip", "child", "volunteer"), pathSegment);

beforeAll(async () => {
  api = await createApiHarness();
  await api.signIn("admin@example.com");
  await api.enableTwoFactor("admin@example.com");

  const events = await api.db.events.prepare("SELECT id FROM events").all<{ id: string }>();
  const registrations = await api.db.events
    .prepare("SELECT id FROM registrations")
    .all<{ id: string }>();

  expect(events.results.length).toBeGreaterThan(0);
  expect(registrations.results.length).toBeGreaterThan(0);

  seededEventIds.push(...events.results.map((row) => row.id));
  seededRegistrationIds.push(...registrations.results.map((row) => row.id));
});

afterAll(async () => {
  await api.close();
});

async function checkRead(path: string) {
  await expectApiResponse(await api.request(path, fuzzInit({ method: "GET" })));
}

async function checkMutation(run: () => Promise<Response>) {
  const before = await snapshotCounts(api.db.events, WATCHED_TABLES);
  const response = await run();

  await expectApiResponse(response);

  if (response.status >= 400 && response.status < 500) {
    await expectNoWrites(api.db.events, before, WATCHED_TABLES);
  }
}

fcTest.prop([query], FUZZ_PARAMS)(
  "GET /api/admin/events tolerates arbitrary query strings",
  async (rawQuery) => {
    await checkRead(withQuery(`/api/admin/events`, rawQuery));
  },
);

fcTest.prop([apiJsonBody], FUZZ_PARAMS)(
  "POST /api/admin/events rejects junk without a 500 or a partial write",
  async (body) => {
    await checkMutation(() => api.request("/api/admin/events", fuzzInit({ method: "POST", body })));
  },
);

fcTest.prop([anyEventId], FUZZ_PARAMS)(
  "GET /api/admin/events/:eventId returns a valid envelope",
  async (eventId) => {
    await checkRead(`/api/admin/events/${eventId}`);
  },
);

fcTest.prop([anyEventId, apiJsonBody], FUZZ_PARAMS)(
  "PATCH /api/admin/events/:eventId rejects junk without a 500 or a partial write",
  async (eventId, body) => {
    await checkMutation(() =>
      api.request(`/api/admin/events/${eventId}`, fuzzInit({ method: "PATCH", body })),
    );
  },
);

fcTest.prop([anyEventId, fc.constantFrom("title", "activity", "overview")], FUZZ_PARAMS)(
  "GET title, activity and overview projections return valid envelopes",
  async (eventId, view) => {
    await checkRead(`/api/admin/events/${eventId}/${view}`);
  },
);

fcTest.prop([anyEventId], FUZZ_PARAMS)(
  "GET /api/admin/events/:eventId/form-versions returns a valid envelope",
  async (eventId) => {
    await checkRead(`/api/admin/events/${eventId}/form-versions`);
  },
);

fcTest.prop([anyEventId, apiJsonBody], FUZZ_PARAMS)(
  "POST /api/admin/events/:eventId/form-versions rejects junk without a 500 or a partial write",
  async (eventId, body) => {
    await checkMutation(() =>
      api.request(`/api/admin/events/${eventId}/form-versions`, fuzzInit({ method: "POST", body })),
    );
  },
);

fcTest.prop([anyEventId, query], FUZZ_PARAMS)(
  "GET /api/admin/events/:eventId/preview tolerates arbitrary query strings",
  async (eventId, rawQuery) => {
    await checkRead(withQuery(`/api/admin/events/${eventId}/preview`, rawQuery));
  },
);

fcTest.prop([anyEventId, query], FUZZ_PARAMS)(
  "GET /api/admin/events/:eventId/support tolerates arbitrary query strings",
  async (eventId, rawQuery) => {
    await checkRead(withQuery(`/api/admin/events/${eventId}/support`, rawQuery));
  },
);

fcTest.prop([anyEventId, query], FUZZ_PARAMS)(
  "GET /api/admin/events/:eventId/registrations tolerates arbitrary query strings",
  async (eventId, rawQuery) => {
    await checkRead(withQuery(`/api/admin/events/${eventId}/registrations`, rawQuery));
  },
);

fcTest.prop([anyEventId, apiJsonBody], FUZZ_PARAMS)(
  "POST /api/admin/events/:eventId/registrations rejects junk without a 500 or a partial write",
  async (eventId, body) => {
    await checkMutation(() =>
      api.request(`/api/admin/events/${eventId}/registrations`, fuzzInit({ method: "POST", body })),
    );
  },
);

fcTest.prop([anyEventId, apiJsonBody], FUZZ_PARAMS)(
  "POST /api/admin/events/:eventId/registrations/manual rejects junk without a 500 or a partial write",
  async (eventId, body) => {
    await checkMutation(() =>
      api.request(
        `/api/admin/events/${eventId}/registrations/manual`,
        fuzzInit({ method: "POST", body }),
      ),
    );
  },
);

fcTest.prop([anyEventId, anyRegistrationId, fc.constantFrom("POST", "DELETE")], FUZZ_PARAMS)(
  "POST and DELETE check-in reject junk ids without a 500 or a partial write",
  async (eventId, registrationId, method) => {
    await checkMutation(() =>
      api.request(
        `/api/admin/events/${eventId}/registrations/${registrationId}/checkin`,
        fuzzInit({ method }),
      ),
    );
  },
);

fcTest.prop([anyEventId, anyRegistrationId], FUZZ_PARAMS)(
  "GET registration QR returns a valid envelope for fuzzed ids",
  async (eventId, registrationId) => {
    await checkRead(`/api/admin/events/${eventId}/registrations/${registrationId}/qr`);
  },
);

const paymentRequest = fc.tuple(fc.constantFrom("POST", "DELETE"), apiJsonBody);

fcTest.prop([anyEventId, anyRegistrationId, paymentRequest], FUZZ_PARAMS)(
  "POST and DELETE payment reject junk without a 500 or a partial write",
  async (eventId, registrationId, [method, body]) => {
    await checkMutation(() =>
      api.request(
        `/api/admin/events/${eventId}/registrations/${registrationId}/payment`,
        fuzzInit({ method, body }),
      ),
    );
  },
);

fcTest.prop([anyEventId], FUZZ_PARAMS)(
  "GET /api/admin/events/:eventId/ticket-types returns a valid envelope",
  async (eventId) => {
    await checkRead(`/api/admin/events/${eventId}/ticket-types`);
  },
);

fcTest.prop([anyEventId, apiJsonBody], FUZZ_PARAMS)(
  "POST /api/admin/events/:eventId/ticket-types rejects junk without a 500 or a partial write",
  async (eventId, body) => {
    await checkMutation(() =>
      api.request(`/api/admin/events/${eventId}/ticket-types`, fuzzInit({ method: "POST", body })),
    );
  },
);

fcTest.prop([anyEventId, anyTicketKey, apiJsonBody], FUZZ_PARAMS)(
  "PATCH /api/admin/events/:eventId/ticket-types/:key rejects junk without a 500 or a partial write",
  async (eventId, key, body) => {
    await checkMutation(() =>
      api.request(
        `/api/admin/events/${eventId}/ticket-types/${key}`,
        fuzzInit({ method: "PATCH", body }),
      ),
    );
  },
);
