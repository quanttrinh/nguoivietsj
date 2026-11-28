import { describe, expect, test } from "vitest";

import { resolveRequestLocale } from "~/platform/i18n/resolve";

function request(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { headers });
}

describe("resolveRequestLocale", () => {
  test("does not read ?locale for generic API errors", () => {
    expect(resolveRequestLocale(request("https://example.com/api/events?locale=fr"))).toBe("en");
  });

  test("auth links opt in to ?locale", () => {
    expect(
      resolveRequestLocale(request("https://example.com/api/auth/verify?locale=fr"), {
        allowQuery: true,
      }),
    ).toBe("fr");
  });

  test("honors x-locale before Accept-Language", () => {
    expect(
      resolveRequestLocale(
        request("https://example.com/api/events", {
          "x-locale": "fr-CA",
          "accept-language": "vi",
        }),
      ),
    ).toBe("fr");
  });
});
