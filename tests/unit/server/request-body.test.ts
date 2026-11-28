import { describe, expect, test } from "vitest";

import { cachedJsonObject } from "~/platform/server/api/helpers/request-body";

function jsonRequest(body: string): Request {
  return new Request("http://localhost/api/auth/sign-in/email-otp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("cachedJsonObject", () => {
  test("parses a request body once and reuses the result", async () => {
    const request = jsonRequest('{"email":"user@example.com"}');
    const first = await cachedJsonObject(request);
    const second = await cachedJsonObject(request);

    expect(second).toBe(first);
    expect(second.email).toBe("user@example.com");
  });

  test("concurrent calls share the same in-flight parse", async () => {
    const request = jsonRequest('{"email":"user@example.com"}');
    const [first, second] = await Promise.all([
      cachedJsonObject(request),
      cachedJsonObject(request),
    ]);

    expect(second).toBe(first);
  });

  test("does not share results between requests", async () => {
    const first = await cachedJsonObject(jsonRequest('{"email":"one@example.com"}'));
    const second = await cachedJsonObject(jsonRequest('{"email":"two@example.com"}'));

    expect(first.email).toBe("one@example.com");
    expect(second.email).toBe("two@example.com");
  });

  test("throws when the body was already consumed", async () => {
    const request = jsonRequest('{"email":"user@example.com"}');
    await request.json();

    await expect(cachedJsonObject(request)).rejects.toThrow("body was consumed");
  });

  test("reuses the cached body after the stream is consumed", async () => {
    const request = jsonRequest('{"email":"user@example.com"}');
    const first = await cachedJsonObject(request);

    expect(request.bodyUsed).toBe(true);
    expect(await cachedJsonObject(request)).toBe(first);
  });

  test("returns an empty object for invalid JSON or non-object bodies", async () => {
    expect(await cachedJsonObject(jsonRequest("not json"))).toEqual({});
    expect(await cachedJsonObject(jsonRequest("[1,2,3]"))).toEqual({});
  });
});
