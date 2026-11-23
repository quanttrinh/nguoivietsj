import { describe, expect, test } from "vitest";

import {
  getTracing,
  withTracingSpan,
  type TracingLike,
  type TracingSpanLike,
} from "../../../src/server/tracing";

function createFakeTracing() {
  const calls: string[] = [];
  const span: TracingSpanLike = {
    setAttributes: () => {
      calls.push("attributes");
    },
    recordException: () => {
      calls.push("exception");
    },
    setStatus: (status) => {
      calls.push(`status:${status.code}`);
    },
    end: () => {
      calls.push("end");
    },
  };
  const tracing: TracingLike = {
    startSpan: (name) => {
      calls.push(`start:${name}`);
      return span;
    },
  };

  return { calls, span, tracing };
}

describe("getTracing", () => {
  test("returns undefined when the runtime has no tracing API", () => {
    expect(getTracing({ executionCtx: undefined })).toBeUndefined();
    expect(getTracing({ executionCtx: {} })).toBeUndefined();
  });

  test("returns undefined when the execution context is unavailable", () => {
    const ctx = {
      get executionCtx(): unknown {
        throw new Error("This context has no ExecutionContext");
      },
    };

    expect(getTracing(ctx)).toBeUndefined();
  });

  test("reads the Cloudflare tracing object from an execution context", () => {
    const { tracing } = createFakeTracing();

    expect(getTracing({ executionCtx: { tracing } })).toBe(tracing);
  });
});

describe("withTracingSpan", () => {
  test("runs the task without a span when tracing is unavailable", async () => {
    let received: TracingSpanLike | undefined = undefined;

    await expect(
      withTracingSpan({
        tracing: undefined,
        name: "test",
        task: async (span) => {
          received = span;
          return "value";
        },
      }),
    ).resolves.toBe("value");
    expect(received).toBeUndefined();
  });

  test("starts, attributes, and ends a span on success", async () => {
    const { calls, span, tracing } = createFakeTracing();

    const result = await withTracingSpan({
      tracing,
      name: "test.span",
      attributes: { "http.route": "/api/health" },
      task: async (active) => {
        expect(active).toBe(span);
        return 42;
      },
    });

    expect(result).toBe(42);
    expect(calls).toEqual(["start:test.span", "attributes", "status:ok", "end"]);
  });

  test("records the exception, marks the span failed, and rethrows", async () => {
    const { calls, tracing } = createFakeTracing();
    const error = new Error("boom");

    await expect(
      withTracingSpan({
        tracing,
        name: "test.span",
        task: async () => {
          throw error;
        },
      }),
    ).rejects.toBe(error);

    expect(calls).toEqual(["start:test.span", "attributes", "exception", "status:error", "end"]);
  });
});
