import { describe, expect, test } from "vitest";

import { resolveWranglerOrigin } from "../plugins/better-auth-url";

const production = {
  routes: [{ pattern: "example.com", custom_domain: true }],
  env: {
    staging: {
      routes: [{ pattern: "staging.example.com", custom_domain: true }],
    },
  },
};

describe("better-auth-url", () => {
  test("uses the top-level custom domain for production", () => {
    expect(resolveWranglerOrigin(production, undefined)).toBe("https://example.com");
  });

  test("uses the selected Wrangler environment", () => {
    expect(resolveWranglerOrigin(production, "staging")).toBe("https://staging.example.com");
  });

  test("skips disabled and wildcard routes", () => {
    expect(
      resolveWranglerOrigin(
        {
          routes: [
            { pattern: "disabled.example.com", custom_domain: true, enabled: false },
            { pattern: "*.example.com", custom_domain: true },
            { pattern: "app.example.com", custom_domain: true },
          ],
        },
        undefined,
      ),
    ).toBe("https://app.example.com");
  });

  test("rejects an unknown environment", () => {
    expect(() => resolveWranglerOrigin(production, "missing")).toThrow(
      'No Wrangler environment "missing"',
    );
  });

  test("rejects configs without a usable custom domain", () => {
    expect(() =>
      resolveWranglerOrigin({ routes: [{ pattern: "example.com" }] }, undefined),
    ).toThrow("No enabled custom-domain route");
  });
});
