// @boundary shared
export const CSP_BASE_DIRECTIVES = {
  baseUri: ["'none'"],
  formAction: ["'self'"],
  objectSrc: ["'none'"],
  imgSrc: ["'self'", "data:"],
  fontSrc: ["'self'"],
  connectSrc: ["'self'", "https://challenges.cloudflare.com", "https://cloudflareinsights.com"],
  frameSrc: [
    "'self'",
    "https://challenges.cloudflare.com",
    "https://www.google.com",
    "https://maps.google.com",
  ],
  workerSrc: ["'self'"],
  manifestSrc: ["'self'"],
  mediaSrc: ["'none'"],
};

/** Sources allowed for scripts by both Astro's CSP meta tag and the Worker headers. */
export const CSP_SCRIPT_RESOURCES = [
  "'self'",
  "https://challenges.cloudflare.com",
  "https://static.cloudflareinsights.com",
] as const;

/** Sources allowed for styles by both Astro's CSP meta tag and the Worker headers. */
export const CSP_STYLE_RESOURCES = ["'self'"] as const;

/**
 * CSP sent by the Worker and written to the static `_headers` file.
 *
 * Script and style directives are intentionally absent: Astro puts per-page
 * hashes in a `Content-Security-Policy` meta tag, and a header without those
 * hashes would block the hashed inline scripts and styles. API responses add
 * `default-src 'none'` on top of this, since they never contain documents.
 */
export const CSP_HEADER_DIRECTIVES = {
  ...CSP_BASE_DIRECTIVES,
  frameAncestors: ["'none'"],
  scriptSrcAttr: ["'none'"],
  styleSrcAttr: ["'none'"],
};
