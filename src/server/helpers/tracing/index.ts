// @boundary server

type SpanAttributes = Record<string, boolean | number | string | undefined>;
type SpanException = string | { name: string; message: string; stack?: string };
interface SpanStatus {
  code: "unset" | "ok" | "error";
  message?: string;
}

export interface TracingSpanLike {
  setAttributes: (attributes: SpanAttributes) => void;
  recordException: (exception: SpanException) => void;
  setStatus: (status: SpanStatus) => void;
  end: () => void;
}

export interface TracingLike {
  startSpan: (name: string) => TracingSpanLike;
}

interface TracedExecutionContext {
  tracing?: TracingLike;
}

function isTracedExecutionContext(value: unknown): value is TracedExecutionContext {
  return typeof value === "object" && value !== null && "tracing" in value;
}

export function getTracing(ctx: { readonly executionCtx: unknown }): TracingLike | undefined {
  try {
    const executionCtx = ctx.executionCtx;

    return isTracedExecutionContext(executionCtx) ? executionCtx.tracing : undefined;
  } catch {
    return undefined;
  }
}

function exceptionValue(error: unknown): SpanException {
  if (error instanceof Error) {
    return error.stack === undefined
      ? { name: error.name, message: error.message }
      : { name: error.name, message: error.message, stack: error.stack };
  }

  return String(error);
}

interface TracingSpanOptions<TResult> {
  tracing: TracingLike | undefined;
  name: string;
  attributes?: SpanAttributes;
  task: (span: TracingSpanLike | undefined) => Promise<TResult>;
}

export async function withTracingSpan<TResult>(
  options: TracingSpanOptions<TResult>,
): Promise<TResult> {
  const { tracing, name, attributes = {}, task } = options;

  if (tracing === undefined) {
    return task(undefined);
  }

  const span = tracing.startSpan(name);
  span.setAttributes(attributes);

  try {
    const result = await task(span);
    span.setStatus({ code: "ok" });
    return result;
  } catch (error) {
    span.recordException(exceptionValue(error));
    span.setStatus({ code: "error", message: String(error) });
    throw error;
  } finally {
    span.end();
  }
}
