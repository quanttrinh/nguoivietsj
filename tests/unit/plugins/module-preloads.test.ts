import { describe, expect, test } from "vitest";

import { configuredHints, matchChunks, staticJsImports } from "../../../plugins/module-preloads";

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

  const chunks = [
    { fileName: "_astro/a.js", moduleIds: ["/app/src/a.ts"], imports: ["_astro/shared.js"] },
    {
      fileName: "_astro/shared.js",
      moduleIds: ["/app/node_modules/preact/dist/preact.mjs"],
      imports: [],
    },
    {
      fileName: "_astro/scan.js",
      moduleIds: ["/app/node_modules/qr/dom.js"],
      imports: [],
    },
  ];

  test("matches selectors by resolved id, package, and chunk name with static imports", () => {
    expect(matchChunks(chunks, "./a", "/app/src/a.ts")).toEqual([
      "_astro/a.js",
      "_astro/shared.js",
    ]);
    expect(matchChunks(chunks, { package: "qr" }, null)).toEqual(["_astro/scan.js"]);
    expect(matchChunks(chunks, { chunk: /shared/u }, null)).toEqual(["_astro/shared.js"]);
    expect(matchChunks(chunks, "missing", null)).toEqual([]);
  });

  test("applies global hints everywhere and route hints only on matching paths", () => {
    const scanner = { package: "qr" };
    const index = new Map<Parameters<typeof matchChunks>[1], string[]>([
      ["preact", ["_astro/shared.js"]],
      [scanner, ["_astro/scan.js"]],
    ]);
    const options = {
      global: { preload: ["preact"] },
      routes: [{ match: /\/checkin\/$/u, prefetch: [scanner] }],
    };

    expect(configuredHints("/en/", options, index)).toEqual({
      preload: ["/_astro/shared.js"],
      prefetch: [],
    });
    expect(configuredHints("/en/checkin/", options, index).prefetch).toEqual(["/_astro/scan.js"]);
  });
});
