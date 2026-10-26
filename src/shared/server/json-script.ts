import { stringifyForScript } from "astro/runtime/server/escape.js";

/**
 * Serialize JSON for a server-rendered script element.
 */
export function stringifyJsonScript(value: unknown): string {
  return stringifyForScript(value);
}
