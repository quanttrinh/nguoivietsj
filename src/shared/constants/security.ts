/**
 * Shared Content-Security-Policy sources.
 *
 * Astro emits page-level hashes through its CSP meta tag. The Worker uses an
 * HTTP header for directives that meta CSP cannot express, such as
 * `frame-ancestors` and the `-attr` restrictions.
 */
export const CSP_SCRIPT_SOURCES = ["'self'", "https://challenges.cloudflare.com"] as const;
export const CSP_STYLE_SOURCES = ["'self'"] as const;

const CSP_SHARED_DIRECTIVES = [
  "base-uri 'none'",
  "form-action 'self'",
  "object-src 'none'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'self' https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com https://www.google.com https://maps.google.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "media-src 'none'",
] as const;

/** Directives emitted in Astro's per-page CSP meta tag. */
export const CSP_META_DIRECTIVES = ["default-src 'self'", ...CSP_SHARED_DIRECTIVES] as const;

/** Directives emitted in the Worker/static HTTP CSP header. */
export const CSP_HEADER_DIRECTIVES = [
  ...CSP_SHARED_DIRECTIVES,
  "frame-ancestors 'none'",
  "script-src-attr 'none'",
  "style-src-attr 'none'",
] as const;
