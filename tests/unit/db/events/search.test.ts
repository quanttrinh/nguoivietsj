import { describe, expect, test } from "vitest";

import { fullTextSearchQuery } from "../../../../src/db/events/search";

describe("fullTextSearchQuery", () => {
  test("builds required prefix tokens from a name", () => {
    expect(fullTextSearchQuery("Ada Lovelace")).toBe("ada* lovelace*");
  });

  test("splits email addresses into searchable tokens", () => {
    expect(fullTextSearchQuery("victim@example.com")).toBe("victim* example* com*");
  });

  test("drops empty input", () => {
    expect(fullTextSearchQuery("   ")).toBeNull();
  });

  test("strips FTS operators and quotes", () => {
    expect(fullTextSearchQuery('Ada" OR *')).toBe("ada* or*");
  });
});
