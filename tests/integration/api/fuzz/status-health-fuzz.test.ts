import { afterAll, beforeAll, expect, vi } from "vitest";

import { isRecord } from "../../../../src/shared/utils/records";
import { createApiHarness, type ApiHarness } from "../harness";
import {
  apiJsonBody,
  apiMethod,
  expectApiEnvelope,
  expectApiResponse,
  expectNoWrites,
  expectSafeApiResponse,
  expectSafeResponse,
  fc,
  fcTest,
  fuzzInit,
  FUZZ_PARAMS,
  headerValue,
  locale,
  nastyText,
  query,
  readBody,
  safeHeaderValue,
  snapshotCounts,
  withQuery,
} from "./toolkit";

/* Keep the fuzz surface identical to public-fuzz: miss-only cache, no cross-case state. */
vi.hoisted(() => {
  Reflect.set(globalThis, "caches", {
    open: () =>
      Promise.resolve({
        match: () => Promise.resolve(undefined),
        put: () => Promise.resolve(undefined),
      }),
  });
});

/** Tables the status OTP flow is allowed to mutate. */
const STATUS_TABLES = [
  "registrations",
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
  "GET /api/health stays healthy for arbitrary query strings",
  async (rawQuery) => {
    const response = await api.request(withQuery("/api/health", rawQuery));
    const body = await readBody(response);

    await expectSafeResponse(response, body);
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, app: true, events: true });
  },
);

fcTest.prop([locale, locale], FUZZ_PARAMS)(
  "GET /api/health is unaffected by hostile x-locale / accept-language headers",
  async (headerLocale, acceptLanguage) => {
    const response = await api.request("/api/health", {
      headers: {
        "accept-language": safeHeaderValue(acceptLanguage),
        "x-locale": safeHeaderValue(headerLocale),
      },
    });
    const body = await readBody(response);

    await expectSafeResponse(response, body);
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, app: true, events: true });
  },
);

fcTest.prop([apiJsonBody], FUZZ_PARAMS)(
  "POST /api/events/status/request never 500s or writes OTPs on random bodies",
  async (body) => {
    const before = await snapshotCounts(api.db.events, STATUS_TABLES);
    const response = await api.request(
      "/api/events/status/request",
      fuzzInit({ body, method: "POST" }),
    );

    await expectApiResponse(response);

    if (response.status >= 400) {
      await expectNoWrites(api.db.events, before, STATUS_TABLES);
    }
  },
);

fcTest.prop([apiJsonBody, locale, locale], FUZZ_PARAMS)(
  "POST /api/events/status/verify localizes validation errors for arbitrary locales",
  async (body, headerLocale, acceptLanguage) => {
    const before = await snapshotCounts(api.db.events, STATUS_TABLES);
    const init = fuzzInit({ body, method: "POST" });
    const headers = new Headers(init.headers);
    headers.set("accept-language", safeHeaderValue(acceptLanguage));
    headers.set("x-locale", safeHeaderValue(headerLocale));
    const response = await api.request("/api/events/status/verify", { ...init, headers });
    const parsed = await readBody(response);

    await expectApiEnvelope(response, parsed);

    if (response.status === 400) {
      expect(isRecord(parsed)).toBe(true);

      if (isRecord(parsed) && isRecord(parsed.error)) {
        expect(typeof parsed.error.code).toBe("string");
        expect(typeof parsed.error.message).toBe("string");
        expect(String(parsed.error.message).length).toBeGreaterThan(0);
      }

      await expectNoWrites(api.db.events, before, STATUS_TABLES);
    }
  },
);

const statusTokenHeader = fc.oneof(
  fc.constant("local-alan-turing-summer-picnic-2027"),
  fc.constant(""),
  headerValue,
  nastyText.map((value) => safeHeaderValue(value).slice(0, 100)),
);

fcTest.prop([statusTokenHeader], FUZZ_PARAMS)(
  "GET /api/events/status returns safe envelopes for arbitrary status tokens",
  async (rawToken) => {
    const response = await api.request("/api/events/status", {
      headers: { "x-status-token": rawToken },
    });

    await expectApiResponse(response);
  },
);

fcTest.prop([apiMethod], FUZZ_PARAMS)(
  "GET /api/health never leaks a 500 for unsupported methods",
  async (method) => {
    // Only the method varies here; the harness supplies the request headers and
    // a GET must never be handed a `body` by the Request constructor.
    const response = await api.request("/api/health", { method });

    await expectSafeApiResponse(response);
  },
);
