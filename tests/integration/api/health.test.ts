/* oxlint-disable typescript/no-unsafe-type-assertion -- Test doubles are asserted here. */
import { describe, expect } from "vitest";

import { test } from "./harness";

describe("health API", () => {
  test("reports both databases healthy", async ({ api }) => {
    const response = await api.request("/api/health");
    const body = (await response.json()) as { ok?: boolean; app?: boolean; events?: boolean };

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, app: true, events: true });
  });

  test("returns 503 when the app database query fails", async ({ api }) => {
    const original = api.env.APP_DB;

    try {
      api.env.APP_DB = {
        prepare: () => ({
          first: () => Promise.reject(new Error("app database unavailable")),
        }),
      };

      const response = await api.request("/api/health");
      const body = (await response.json()) as { ok?: boolean; app?: boolean; events?: boolean };

      expect(response.status).toBe(503);
      expect(body).toEqual({ ok: false, app: false, events: false });
    } finally {
      api.env.APP_DB = original;
    }
  });

  test("returns 503 when the event engine query fails", async ({ api }) => {
    const original = api.env.EVENT_ENGINE_DB;

    try {
      api.env.EVENT_ENGINE_DB = {
        prepare: () => ({
          first: () => Promise.reject(new Error("event engine unavailable")),
        }),
      };

      const response = await api.request("/api/health");
      const body = (await response.json()) as { ok?: boolean; app?: boolean; events?: boolean };

      expect(response.status).toBe(503);
      expect(body).toEqual({ ok: false, app: false, events: false });
    } finally {
      api.env.EVENT_ENGINE_DB = original;
    }
  });
});
