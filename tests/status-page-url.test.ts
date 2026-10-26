import { describe, expect, test } from "vitest";

import { statusPageUrl } from "../src/events/services/status-url";

describe("statusPageUrl", () => {
  test("builds a same-origin status URL for a supported locale", () => {
    const url = statusPageUrl("https://nguoivietsj.ca", "fr", "abc");

    expect(url).toBe("https://nguoivietsj.ca/fr/events/status/view?token=abc");
  });

  for (const locale of ["/evil.example", "//evil.example", "https://evil.example", "../../api"]) {
    test(`keeps the base origin for malicious locale ${locale}`, () => {
      const url = new URL(statusPageUrl("https://nguoivietsj.ca", locale, "abc"));

      expect(url.origin).toBe("https://nguoivietsj.ca");
      expect(url.pathname).toBe("/en/events/status/view");
    });
  }
});
