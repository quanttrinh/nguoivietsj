// @boundary server
import { existsSync } from "node:fs";
import path from "node:path";

/** Walk up from this module until the repository's `package.json`. */
function findRoot(start: string) {
  let current = start;

  while (!existsSync(path.join(current, "package.json"))) {
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`Could not find the repository root from ${start}.`);
    }
    current = parent;
  }

  return current;
}

/** Repository root, independent of how deeply the caller is nested. */
export const ROOT = findRoot(import.meta.dirname);
