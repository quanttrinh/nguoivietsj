// @boundary server
import { isRecord } from "~/platform/utils/records";

const parsedBodies = new WeakMap<Request, Promise<Record<string, unknown>>>();

/**
 * Parse a JSON request body at most once per Request.
 *
 * Rate-limit key functions and route handlers both need the body; parsing it in
 * each place wastes CPU. The parsed object is cached so every caller shares one
 * read of the request stream.
 */
export function cachedJsonObject(request: Request): Promise<Record<string, unknown>> {
  const cached = parsedBodies.get(request);

  if (cached !== undefined) {
    return cached;
  }

  const parsed = (async (): Promise<Record<string, unknown>> => {
    if (request.bodyUsed) {
      throw new Error("Request body was consumed before cachedJsonObject");
    }

    try {
      const body: unknown = await request.json();

      return isRecord(body) ? body : {};
    } catch {
      return {};
    }
  })();

  parsedBodies.set(request, parsed);
  return parsed;
}
