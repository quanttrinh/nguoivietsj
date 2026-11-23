// @boundary shared
/** Convert a camelCase directive name to its CSP kebab-case form. */
export const cspDirectiveName = (value: string): string =>
  value.replaceAll(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`);

/** Serialize directive maps into a Content-Security-Policy header string. */
export const cspHeaderValue = (directives: Record<string, readonly string[]>): string =>
  Object.entries(directives)
    .map(([name, values]) => `${cspDirectiveName(name)} ${values.join(" ")}`)
    .join("; ");
