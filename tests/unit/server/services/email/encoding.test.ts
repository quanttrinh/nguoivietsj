import { describe, expect, test } from "vitest";

import { toBase64, toBase64Url, wrapBase64 } from "~/platform/server/email/encoding";

// oxlint-disable-next-line unicorn/number-literal-case -- byte-array fixtures read best in lowercase hex.
const BYTES = new Uint8Array([0xfb, 0xff, 0x00]);

describe("email encoding", () => {
  test("toBase64 emits the standard alphabet with padding", () => {
    expect(toBase64(BYTES)).toBe("+/8A");
  });

  test("toBase64Url emits the URL-safe alphabet without padding", () => {
    expect(toBase64Url(BYTES)).toBe("-_8A");
    expect(toBase64Url(new TextEncoder().encode("?"))).toBe("Pw");
  });

  test("wrapBase64 splits MIME lines at 76 characters", () => {
    expect(wrapBase64("A".repeat(76))).toBe("A".repeat(76));
    expect(wrapBase64("A".repeat(77))).toBe(`${"A".repeat(76)}\r\nA`);
    expect(wrapBase64("")).toBe("");
  });
});
