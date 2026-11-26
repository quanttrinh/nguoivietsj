import { describe, expect, test } from "vitest";

import { resolveAuthBaseUrl } from "~/features/auth/server/base-url";

describe("resolveAuthBaseUrl", () => {
  test("passes a production origin through unchanged", () => {
    expect(resolveAuthBaseUrl("https://nguoivietsj.ca")).toBe("https://nguoivietsj.ca");
  });

  test("allows all loopback hosts for a localhost origin", () => {
    expect(resolveAuthBaseUrl("http://localhost:4321")).toEqual({
      allowedHosts: ["localhost:4321", "127.0.0.1:4321", "[::1]:4321"],
      protocol: "auto",
      fallback: "http://localhost:4321",
    });
  });

  test("allows all loopback hosts for a 127.0.0.1 origin", () => {
    expect(resolveAuthBaseUrl("http://127.0.0.1:5173")).toEqual({
      allowedHosts: ["localhost:5173", "127.0.0.1:5173", "[::1]:5173"],
      protocol: "auto",
      fallback: "http://127.0.0.1:5173",
    });
  });

  test("allows all loopback hosts for an IPv6 origin", () => {
    expect(resolveAuthBaseUrl("http://[::1]:3000")).toEqual({
      allowedHosts: ["localhost:3000", "127.0.0.1:3000", "[::1]:3000"],
      protocol: "auto",
      fallback: "http://[::1]:3000",
    });
  });

  test("falls back to a usable localhost origin for an invalid origin", () => {
    expect(resolveAuthBaseUrl("not a url")).toBe("http://localhost:4321");
  });

  test("uses the https default port for an https localhost origin", () => {
    expect(resolveAuthBaseUrl("https://localhost")).toEqual({
      allowedHosts: ["localhost:443", "127.0.0.1:443", "[::1]:443"],
      protocol: "auto",
      fallback: "https://localhost",
    });
  });

  test("uses the http default port for a portless http localhost origin", () => {
    expect(resolveAuthBaseUrl("http://localhost")).toEqual({
      allowedHosts: ["localhost:80", "127.0.0.1:80", "[::1]:80"],
      protocol: "auto",
      fallback: "http://localhost",
    });
  });
});
