import { describe, expect, test } from "vitest";

import { safeExternalUrl } from "~/features/events/domain/url";

describe("safeExternalUrl", () => {
  test("allows http, https, and mailto", () => {
    expect(safeExternalUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(safeExternalUrl("http://example.com/a")).toBe("http://example.com/a");
    expect(safeExternalUrl("mailto:a@example.com")).toBe("mailto:a@example.com");
  });

  test("rejects script, data, and relative URLs", () => {
    // oxlint-disable-next-line eslint/no-script-url -- asserting the sanitizer rejects it.
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeExternalUrl("/events")).toBeNull();
    expect(safeExternalUrl("")).toBeNull();
    expect(safeExternalUrl(null)).toBeNull();
  });
});
