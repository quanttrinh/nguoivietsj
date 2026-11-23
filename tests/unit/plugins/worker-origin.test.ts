import { describe, expect, test } from "vitest";

import { resolveWorkerOrigin, resolveWranglerOrigin } from "../../../plugins/worker-origin";

const production = {
  routes: [{ pattern: "example.com", custom_domain: true }],
  env: {
    staging: {
      routes: [{ pattern: "staging.example.com", custom_domain: true }],
    },
  },
};

const input = {
  preview: false,
  serverPort: 4321,
  productionOrigin: "https://example.com",
} as const;

describe("worker-origin", () => {
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

  test("uses a scalar string route as a custom domain", () => {
    expect(resolveWranglerOrigin({ route: "example.com" }, undefined)).toBe("https://example.com");
  });

  test("uses a scalar string route from a selected environment", () => {
    expect(
      resolveWranglerOrigin({ env: { staging: { route: "staging.example.com" } } }, "staging"),
    ).toBe("https://staging.example.com");
  });

  test("still rejects a wildcard scalar string route", () => {
    expect(() => resolveWranglerOrigin({ route: "*.example.com" }, undefined)).toThrow(
      "No enabled custom-domain route",
    );
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
    expect(resolveWorkerOrigin({ ...input, command: "build" })).toBe("https://example.com");
  });

  test("uses localhost during development", () => {
    expect(resolveWorkerOrigin({ ...input, command: "dev" })).toBe("http://localhost:4321");
  });

  test("uses localhost for sync", () => {
    expect(resolveWorkerOrigin({ ...input, command: "sync" })).toBe("http://localhost:4321");
  });

  test("uses localhost for preview", () => {
    expect(resolveWorkerOrigin({ ...input, command: "preview" })).toBe("http://localhost:4321");
  });

  test("uses localhost for preview builds", () => {
    expect(resolveWorkerOrigin({ ...input, command: "build", preview: true })).toBe(
      "http://localhost:4321",
    );
  });

  test("honors a custom server port", () => {
    expect(resolveWorkerOrigin({ ...input, command: "dev", serverPort: 4322 })).toBe(
      "http://localhost:4322",
    );
  });
});
