// @boundary server
export type AuthBaseUrl =
  | string
  | {
      allowedHosts: string[];
      protocol: "auto" | "http" | "https";
      fallback?: string;
    };

/**
 * Derive Better Auth's base URL from the injected Worker origin.
 *
 * Production origins pass through unchanged. Loopback origins produce a
 * host-agnostic config so local sign-in works on localhost, 127.0.0.1, or IPv6,
 * with the injected origin retained as the non-local fallback.
 */
export function resolveAuthBaseUrl(origin: string): AuthBaseUrl {
  let url: URL;

  try {
    url = new URL(origin);
  } catch {
    // Tests and environments without the build-time global still need a valid URL.
    return "http://localhost:4321";
  }

  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);

  if (!isLocal) {
    return origin;
  }

  return {
    allowedHosts: [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`],
    protocol: "auto",
    fallback: origin,
  };
}
