// @boundary shared
export const CSP_BASE_DIRECTIVES = {
  baseUri: ["'none'"],
  formAction: ["'self'"],
  objectSrc: ["'none'"],
  imgSrc: ["'self'", "data:"],
  fontSrc: ["'self'"],
  connectSrc: ["'self'", "https://challenges.cloudflare.com"],
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
export const CSP_SCRIPT_RESOURCES = ["'self'", "https://challenges.cloudflare.com"] as const;

/** Sources allowed for styles by both Astro's CSP meta tag and the Worker headers. */
export const CSP_STYLE_RESOURCES = ["'self'"] as const;

export const CSP_HEADER_DIRECTIVES = {
  ...CSP_BASE_DIRECTIVES,
  defaultSrc: ["'self'"],
  scriptSrc: [...CSP_SCRIPT_RESOURCES],
  styleSrc: [...CSP_STYLE_RESOURCES],
  frameAncestors: ["'none'"],
  scriptSrcAttr: ["'none'"],
  styleSrcAttr: ["'none'"],
};
