import { describe, expect, test } from "vitest";

import { statusPageUrl } from "~/features/events/domain/status-paths";

describe("statusPageUrl", () => {
  test("builds a same-origin link-exchange URL for a supported locale", () => {
    const url = statusPageUrl("https://nguoivietsj.ca", "fr", "abc");

    expect(url).toBe("https://nguoivietsj.ca/api/events/status/link?token=abc&locale=fr");
  });

  for (const locale of ["/evil.example", "//evil.example", "https://evil.example", "../../api"]) {
    test(`keeps the base origin and default locale for malicious locale ${locale}`, () => {
      const url = new URL(statusPageUrl("https://nguoivietsj.ca", locale, "abc"));

      expect(url.origin).toBe("https://nguoivietsj.ca");
      expect(url.pathname).toBe("/api/events/status/link");
      expect(url.searchParams.get("locale")).toBe("en");
      expect(url.searchParams.get("token")).toBe("abc");
    });
  }
});
