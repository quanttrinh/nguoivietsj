import { isRecord } from "~/shared/utils/records";

function errorResponse(error: string, status: number): Response {
  return Response.json(
    { error },
    {
      status,
      headers: { "cache-control": "no-store" },
    },
  );
}

/**
 * Read a JSON object with a hard byte cap.
 *
 * `Content-Length` is checked first, but the body is also streamed so a
 * chunked request cannot bypass the limit. Only `application/json` is
 * accepted; other media types are rejected before parsing.
 */
export async function readJsonObject(
  request: Request,
  maxBytes: number,
): Promise<Record<string, unknown> | Response> {
  const mediaType = (request.headers.get("content-type") ?? "")
    .split(";", 1)[0]
    ?.trim()
    .toLowerCase();

  if (mediaType !== "application/json") {
    return errorResponse("unsupported_content_type", 415);
  }

  const declaredLength = Number(request.headers.get("content-length"));

  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return errorResponse("payload_too_large", 413);
  }

  if (request.body === null) {
    return errorResponse("invalid_payload", 400);
  }

  const reader = request.body.getReader() as ReadableStreamDefaultReader<Uint8Array>;
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    for (;;) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- streams must be read sequentially.
      const chunk = await reader.read();

      if (chunk.done) {
        break;
      }

      if (chunk.value !== undefined) {
        totalBytes += chunk.value.byteLength;

        if (totalBytes > maxBytes) {
          void reader.cancel().catch(() => null);
          return errorResponse("payload_too_large", 413);
        }

        chunks.push(chunk.value);
      }
    }
  } catch {
    return errorResponse("invalid_payload", 400);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const parsed = ((): unknown => {
    try {
      return JSON.parse(new TextDecoder().decode(body));
    } catch {
      return null;
    }
  })();

  return isRecord(parsed) ? parsed : errorResponse("invalid_payload", 400);
}

/** Read a small URL-encoded form body. */
export async function readFormUrlEncoded(
  request: Request,
  maxBytes: number,
): Promise<URLSearchParams | null> {
  const contentLength = Number(request.headers.get("content-length"));

  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return null;
  }

  if (!(request.headers.get("content-type") ?? "").includes("application/x-www-form-urlencoded")) {
    return null;
  }

  const body = await request.text();

  return body.length > maxBytes ? null : new URLSearchParams(body);
}
