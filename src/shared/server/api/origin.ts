function allowedOrigins(request: Request): Set<string> {
  const url = new URL(request.url);
  const origins = new Set([url.origin]);
  const host = request.headers.get("host");

  if (host !== null && host.length > 0) {
    origins.add(`${url.protocol}//${host}`);
  }

  return origins;
}

/** Validate Origin/Referer/Sec-Fetch-Site for state-changing requests. */
export function isSameOriginRequest(request: Request): boolean {
  const origins = allowedOrigins(request);
  const origin = request.headers.get("origin");

  if (origin !== null) {
    return origins.has(origin);
  }

  const referer = request.headers.get("referer");

  if (referer !== null) {
    try {
      return origins.has(new URL(referer).origin);
    } catch {
      return false;
    }
  }

  return request.headers.get("sec-fetch-site") === "same-origin";
}
