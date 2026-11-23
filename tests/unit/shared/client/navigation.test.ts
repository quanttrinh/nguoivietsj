import { describe, expect, test } from "vitest";

import { safeRedirect } from "../../../../src/shared/client/navigation";

const ORIGIN = "https://example.com";
const FALLBACK = "/vi/admin/";

function redirect(value: string) {
  return safeRedirect(`?redirect=${encodeURIComponent(value)}`, {
    origin: ORIGIN,
    fallback: FALLBACK,
  });
}

describe("safeRedirect", () => {
  test("uses the fallback when no redirect is present", () => {
    expect(safeRedirect("", { origin: ORIGIN, fallback: FALLBACK })).toBe(FALLBACK);
  });

  test("defaults the fallback to the site root", () => {
    expect(safeRedirect("", { origin: ORIGIN })).toBe("/");
  });

  test("keeps a same-origin absolute URL including hash", () => {
    expect(redirect("https://example.com/vi/events/123?tab=foo#details")).toBe(
      "/vi/events/123?tab=foo#details",
    );
  });

  test("keeps a same-origin relative URL including hash", () => {
    expect(redirect("/vi/events/123?tab=foo#details")).toBe("/vi/events/123?tab=foo#details");
  });

  test("rejects a cross-origin redirect", () => {
    expect(redirect("https://evil.example/vi/admin")).toBe(FALLBACK);
  });

  test("does not throw on a malformed redirect", () => {
    expect(redirect("http://[")).toBe(FALLBACK);
  });
});
