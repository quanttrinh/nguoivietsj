/* oxlint-disable typescript/no-unsafe-type-assertion -- API response bodies are asserted in tests. */
import { describe, expect, onTestFinished } from "vitest";

import { test } from "./harness";

describe("health API", () => {
  test("reports both databases healthy", async ({ api }) => {
    const response = await api.request("/api/health");
    const body = (await response.json()) as { ok?: boolean; app?: boolean; events?: boolean };

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, app: true, events: true });
    // A live DB check must never be served from cache.
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  // Register the restore where the test double is installed so cleanup cannot
  // be skipped by a failing assertion (Vitest Test Context: onTestFinished).
  test("returns 503 when the app database query fails", async ({ api }) => {
    const original = api.env.APP_DB;

    onTestFinished(() => {
      api.env.APP_DB = original;
    });

    api.env.APP_DB = {
      prepare: () => ({
        first: () => Promise.reject(new Error("app database unavailable")),
      }),
    };

    const response = await api.request("/api/health");
    const body = (await response.json()) as { ok?: boolean; app?: boolean; events?: boolean };

    expect(response.status).toBe(503);
    expect(body).toEqual({ ok: false, app: false, events: false });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  test("returns 503 when the event engine query fails", async ({ api }) => {
    const original = api.env.EVENT_ENGINE_DB;

    onTestFinished(() => {
      api.env.EVENT_ENGINE_DB = original;
    });

    api.env.EVENT_ENGINE_DB = {
      prepare: () => ({
        first: () => Promise.reject(new Error("event engine unavailable")),
      }),
    };

    const response = await api.request("/api/health");
    const body = (await response.json()) as { ok?: boolean; app?: boolean; events?: boolean };

    expect(response.status).toBe(503);
    expect(body).toEqual({ ok: false, app: false, events: false });
  });
});
