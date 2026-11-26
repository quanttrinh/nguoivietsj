import { Hono, type ExecutionContext } from "hono";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { TracingLike } from "~/platform/server/api/helpers/tracing";

const mocks = vi.hoisted(() => ({
  routePath: vi.fn<() => string>(() => "/api/auth/get-session"),
  getSession: vi.fn<() => Promise<Response>>(),
  setAttributes: vi.fn(),
}));

vi.mock("hono/route", () => ({ routePath: mocks.routePath }));
vi.mock("~/features/auth/server/auth", () => ({
  auth: () => ({ api: { getSession: mocks.getSession } }),
}));

const { authRoutes } = await import("~/features/auth/server/api/auth");

function testApp() {
  return new Hono().route("/api/auth", authRoutes);
}

const SESSION_URL = "https://example.com/api/auth/get-session";

beforeEach(() => {
  mocks.routePath.mockClear();
  mocks.setAttributes.mockClear();
  mocks.getSession.mockReset();
  mocks.getSession.mockResolvedValue(Response.json({ status: "success" }));
});

describe("lazy auth tracing attributes", () => {
  test("does not compute a route path when tracing is unavailable", async () => {
    const response = await testApp().request(SESSION_URL, {}, {});

    expect(response.status).toBe(200);
    expect(mocks.getSession).toHaveBeenCalledTimes(1);
    expect(mocks.routePath).not.toHaveBeenCalled();
    expect(mocks.setAttributes).not.toHaveBeenCalled();
  });

  test("still sets route attributes on the span when tracing is available", async () => {
    const span = {
      setAttributes: mocks.setAttributes,
      recordException: vi.fn(),
      setStatus: vi.fn(),
      end: vi.fn(),
    };
    const executionCtx: ExecutionContext & { tracing: TracingLike } = {
      waitUntil: vi.fn<() => void>(),
      passThroughOnException: vi.fn<() => void>(),
      props: {},
      tracing: { startSpan: vi.fn(() => span) },
    };

    const response = await testApp().request(SESSION_URL, {}, {}, executionCtx);

    expect(response.status).toBe(200);
    expect(mocks.routePath).toHaveBeenCalledTimes(1);
    expect(mocks.setAttributes).toHaveBeenCalledWith({
      "auth.operation": "/api/auth/get-session",
    });
    expect(span.end).toHaveBeenCalledTimes(1);
  });
});
