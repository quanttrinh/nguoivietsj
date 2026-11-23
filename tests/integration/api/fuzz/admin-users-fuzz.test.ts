/* oxlint-disable typescript/no-unsafe-type-assertion -- fuzz bodies are intentionally untyped. */
import { afterAll, beforeAll } from "vitest";

import { createApiHarness, type ApiHarness } from "../harness";
import {
  expectApiResponse,
  expectNoWrites,
  fcTest,
  fuzzInit,
  FUZZ_PARAMS,
  headerValue,
  idSegment,
  jsonBody,
  query,
  snapshotCounts,
  withQuery,
  type TableCounts,
} from "./toolkit";

let api: ApiHarness;

beforeAll(async () => {
  api = await createApiHarness();
  // Sign in and enroll in 2FA exactly once. After enrollment a fresh admin
  // sign-in yields a 2FA challenge with no session, so these properties never
  // re-authenticate and simply reuse the cookie captured here.
  await api.signIn("admin@example.com");
  await api.enableTwoFactor("admin@example.com");
});

afterAll(async () => {
  await api.close();
});

const USER_TABLES = ["user", "account"] as const;

/** Snapshot the only tables a mutating admin-user request can write to. */
function counts(): Promise<Partial<TableCounts>> {
  return snapshotCounts(api.db.app, USER_TABLES);
}

/** Assert the Hono envelope and prove rejected mutations wrote nothing. */
async function expectSafeEnvelope(response: Response, before: Partial<TableCounts>) {
  await expectApiResponse(response);

  if (response.status >= 400 && response.status < 500) {
    await expectNoWrites(api.db.app, before, USER_TABLES);
  }
}

fcTest.prop([query], FUZZ_PARAMS)(
  "GET /api/admin/users tolerates arbitrary query strings",
  async (rawQuery) => {
    const response = await api.request(withQuery("/api/admin/users", rawQuery));

    await expectApiResponse(response);
  },
);

fcTest.prop([headerValue], FUZZ_PARAMS)(
  "GET /api/admin/users localizes errors for arbitrary x-locale / accept-language values",
  async (value) => {
    const response = await api.request("/api/admin/users?page=0", {
      headers: { "x-locale": value, "accept-language": value },
    });

    await expectApiResponse(response);
  },
);

fcTest.prop([jsonBody], FUZZ_PARAMS)(
  "POST /api/admin/users rejects arbitrary JSON without writing",
  async (body) => {
    const before = await counts();
    const response = await api.request("/api/admin/users", fuzzInit({ method: "POST", body }));

    await expectSafeEnvelope(response, before);
  },
);

fcTest.prop([idSegment, jsonBody], FUZZ_PARAMS)(
  "PATCH /api/admin/users/:userId tolerates random ids and JSON",
  async (userId, body) => {
    const before = await counts();
    const response = await api.request(
      `/api/admin/users/${userId}`,
      fuzzInit({ method: "PATCH", body }),
    );

    await expectSafeEnvelope(response, before);
  },
);

fcTest.prop([idSegment], FUZZ_PARAMS)(
  "DELETE /api/admin/users/:userId tolerates random ids without partial writes",
  async (userId) => {
    const before = await counts();
    const response = await api.request(
      `/api/admin/users/${userId}`,
      fuzzInit({ method: "DELETE" }),
    );

    await expectSafeEnvelope(response, before);
  },
);
