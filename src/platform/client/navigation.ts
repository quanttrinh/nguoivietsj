// @boundary client
/**
 * Resolve a same-origin `redirect` query value for a post-auth navigation.
 * Cross-origin, malformed, or missing values use the caller's fallback.
 */
export function safeRedirect(
  search: string,
  options: { origin: string; fallback?: string },
): string {
  const fallback = options.fallback ?? "/";
  const redirect = new URLSearchParams(search).get("redirect");

  if (redirect === null) {
    return fallback;
  }

  try {
    const target = new URL(redirect, options.origin);

    if (target.origin !== options.origin) {
      return fallback;
    }

    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}
