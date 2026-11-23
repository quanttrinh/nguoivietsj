import { afterAll, beforeAll } from "vitest";

import { createApiHarness, type ApiHarness } from "../harness";
import {
  apiJsonBody,
  apiMethod,
  fc,
  expectApiResponse,
  expectNoWrites,
  fcTest,
  fuzzInit,
  FUZZ_PARAMS,
  locale,
  pathSegment,
  query,
  snapshotCounts,
  withQuery,
} from "./toolkit";

/** Tables a registration attempt is allowed to mutate. */
const MUTATION_TABLES = [
  "registrations",
  "registration_contacts",
  "registration_tickets",
  "registration_status_otps",
  "registration_status_sessions",
] as const;

let api: ApiHarness;

beforeAll(async () => {
  api = await createApiHarness();
});

afterAll(async () => {
  await api.close();
});

fcTest.prop([query], FUZZ_PARAMS)(
  "GET /api/events returns a safe envelope for arbitrary query strings",
  async (rawQuery) => {
    const response = await api.request(withQuery("/api/events", rawQuery));

    await expectApiResponse(response);
  },
);

fcTest.prop([pathSegment, query], FUZZ_PARAMS)(
  "GET /api/events/:slug returns a safe envelope for hostile slugs and queries",
  async (slug, rawQuery) => {
    const suffix = rawQuery ? `?${rawQuery}` : "";
    const response = await api.request(`/api/events/${slug}${suffix}`);

    await expectApiResponse(response);
  },
);

fcTest.prop([pathSegment, locale], FUZZ_PARAMS)(
  "GET /api/events/:slug falls back safely for arbitrary locale query values",
  async (slug, requestedLocale) => {
    const response = await api.request(
      `/api/events/${slug}?locale=${encodeURIComponent(requestedLocale)}`,
    );

    await expectApiResponse(response);
  },
);

fcTest.prop([pathSegment, apiJsonBody], FUZZ_PARAMS)(
  "POST /api/events/:slug/registrations never 500s or partially writes on random bodies",
  async (slug, body) => {
    const before = await snapshotCounts(api.db.events, MUTATION_TABLES);
    const response = await api.request(
      `/api/events/${slug}/registrations`,
      // Turnstile must pass so the body validator (not the challenge) is fuzzed.
      fuzzInit({ body, headers: { "x-turnstile-token": "test-token" }, method: "POST" }),
    );

    await expectApiResponse(response);

    if (response.status >= 400) {
      await expectNoWrites(api.db.events, before, MUTATION_TABLES);
    }
  },
);

fcTest.prop([pathSegment], FUZZ_PARAMS)(
  "unknown /api paths return the standard error envelope",
  async (suffix) => {
    const response = await api.request(`/api/fuzz-unknown-${suffix}`);

    await expectApiResponse(response);
  },
);

const knownPath = fc.constantFrom(
  "/api/events",
  "/api/events/test-event-2027",
  "/api/events/test-event-2027/registrations",
  "/api/events/status/request",
  "/api/events/status",
);

fcTest.prop([apiMethod, knownPath], FUZZ_PARAMS)(
  "known API paths return safe envelopes for every HTTP method",
  async (method, path) => {
    // Only the method varies here; the harness supplies the request headers and
    // a GET must never be handed a `body` by the Request constructor.
    const response = await api.request(path, { method });

    await expectApiResponse(response);
  },
);
