import { describe, expect, test } from "vitest";

import { resolveAuthBaseUrl, resolveWranglerOrigin } from "../plugins/better-auth-url";

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

  test("uses the production origin for production builds", () => {
    expect(
      resolveAuthBaseUrl({
        command: "build",
        serverPort: 4321,
        productionOrigin: "https://example.com",
      }),
    ).toBe("https://example.com");
  });

  test("allows loopback preview hosts with the production fallback", () => {
    expect(
      resolveAuthBaseUrl({
        command: "build",
        preview: true,
        serverPort: 4321,
        productionOrigin: "https://example.com",
      }),
    ).toEqual({
      allowedHosts: ["localhost:4321", "127.0.0.1:4321", "[::1]:4321"],
      protocol: "auto",
      fallback: "https://example.com",
    });
  });

  test("uses the configured dev port", () => {
    expect(
      resolveAuthBaseUrl({
        command: "dev",
        serverPort: 4322,
        productionOrigin: "http://localhost:4322",
      }),
    ).toEqual({
      allowedHosts: ["localhost:4322", "127.0.0.1:4322", "[::1]:4322"],
      protocol: "auto",
      fallback: "http://localhost:4322",
    });
  });
});
