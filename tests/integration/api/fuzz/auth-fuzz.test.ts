import { afterAll, beforeAll } from "vitest";

import { createApiHarness, type ApiHarness } from "../harness";
import {
  expectSafeApiResponse,
  fcTest,
  fuzzInit,
  FUZZ_PARAMS,
  jsonBody,
  pathSegment,
  query,
} from "./toolkit";

let api: ApiHarness;

beforeAll(async () => {
  api = await createApiHarness();
  // Authenticate once. The harness captures the admin cookie from this sign-in;
  // none of these properties call signIn again (2FA is enabled below) or sign
  // out, so the session stays valid for every request.
  await api.signIn("admin@example.com");
  await api.enableTwoFactor("admin@example.com");
});

afterAll(async () => {
  await api.close();
});

/*
 * NOTE ON SIGN-OUT: a real POST /api/auth/sign-out would invalidate the shared
 * admin cookie and break every later property. Because 2FA is enabled in
 * beforeAll we cannot re-authenticate afterwards (a fresh admin sign-in only
 * returns a 2FA challenge), so successful sign-out is deliberately excluded
 * from this fuzz suite. Instead we fuzz /api/auth/sign-out/invalid, an unknown
 * suffix that Better Auth can only 404 and that cannot clear the session.
 */

fcTest.prop([jsonBody], FUZZ_PARAMS)(
  "POST /api/auth/sign-in/email-otp survives arbitrary JSON bodies",
  async (body) => {
    const response = await api.request(
      "/api/auth/sign-in/email-otp",
      fuzzInit({ method: "POST", body }),
    );

    await expectSafeApiResponse(response);
  },
);

fcTest.prop([jsonBody], FUZZ_PARAMS)(
  "POST /api/auth/sign-up/email survives arbitrary JSON bodies",
  async (body) => {
    const response = await api.request(
      "/api/auth/sign-up/email",
      fuzzInit({ method: "POST", body }),
    );

    await expectSafeApiResponse(response);
  },
);

// A GET cannot carry a request body, so fuzz its query string instead; the
// catch-all also accepts POST, which lets us fuzz a JSON body at the same path.
fcTest.prop([query], FUZZ_PARAMS)(
  "GET /api/auth/get-session survives arbitrary query strings",
  async (rawQuery) => {
    const suffix = rawQuery.length === 0 ? "" : `?${rawQuery}`;
    const response = await api.request(`/api/auth/get-session${suffix}`);

    await expectSafeApiResponse(response);
  },
);

fcTest.prop([jsonBody], FUZZ_PARAMS)(
  "POST /api/auth/get-session survives arbitrary JSON bodies",
  async (body) => {
    const response = await api.request("/api/auth/get-session", fuzzInit({ method: "POST", body }));

    await expectSafeApiResponse(response);
  },
);

fcTest.prop([jsonBody], FUZZ_PARAMS)(
  "POST /api/auth/sign-out/invalid cannot clear the session",
  async (body) => {
    const response = await api.request(
      "/api/auth/sign-out/invalid",
      fuzzInit({ method: "POST", body }),
    );

    await expectSafeApiResponse(response);

    // The cookie must still be usable after fuzzing a sign-out-shaped path.
    const session = await api.request("/api/auth/get-session");
    await expectSafeApiResponse(session);
  },
);

fcTest.prop([jsonBody], FUZZ_PARAMS)(
  "POST /api/auth/send-otp survives arbitrary JSON bodies",
  async (body) => {
    const response = await api.request("/api/auth/send-otp", fuzzInit({ method: "POST", body }));

    await expectSafeApiResponse(response);
  },
);

fcTest.prop([jsonBody], FUZZ_PARAMS)(
  "POST /api/auth/verify-otp survives arbitrary JSON bodies",
  async (body) => {
    const response = await api.request("/api/auth/verify-otp", fuzzInit({ method: "POST", body }));

    await expectSafeApiResponse(response);
  },
);

fcTest.prop([pathSegment, jsonBody], FUZZ_PARAMS)(
  "POST /api/auth/:random survives an arbitrary path and body",
  async (segment, body) => {
    const response = await api.request(`/api/auth/${segment}`, fuzzInit({ method: "POST", body }));

    await expectSafeApiResponse(response);
  },
);

fcTest.prop([pathSegment], FUZZ_PARAMS)(
  "GET /api/auth/:random survives an arbitrary path",
  async (segment) => {
    const response = await api.request(`/api/auth/${segment}`);

    await expectSafeApiResponse(response);
  },
);
