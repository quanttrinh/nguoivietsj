import { describe, expect, test } from "vitest";

import { staticJsImports } from "../plugins/module-preloads";

describe("module-preloads", () => {
  test("collects static imports and re-exports of JavaScript modules", () => {
    const source = `
      import { a } from "./a.js";
      import "./side.js";
      import styles from "./styles.css";
      export * from "./b.js";
      export { c } from "./c.js";
      export const local = 1;
      const lazy = import("./lazy.js");
    `;

    expect(staticJsImports(source, "chunk.js")).toEqual([
      "./a.js",
      "./side.js",
      "./b.js",
      "./c.js",
    ]);
  });

  test("rejects invalid JavaScript", () => {
    expect(() => staticJsImports("export {", "broken.js")).toThrow("Failed to parse broken.js");
  });
});
