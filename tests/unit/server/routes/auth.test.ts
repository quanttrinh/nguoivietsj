import { describe, expect, test } from "vitest";

import {
  authMessage,
  localizeAuthResponse,
  resolveAuthLocale,
} from "../../../../src/server/routes/auth";
import enMessages from "../../../../translations/en.json";
import frMessages from "../../../../translations/fr.json";
import viMessages from "../../../../translations/vi.json";

function request(url: string, headers?: HeadersInit): Request {
  return new Request(url, headers === undefined ? {} : { headers });
}

function jsonResponse(body: unknown, status = 400): Response {
  return Response.json(body, { status });
}

describe("auth locale resolution", () => {
  test("prefers an explicit supported query locale", () => {
    expect(
      resolveAuthLocale(
        request("https://example.com/api/auth/sign-in?locale=fr", {
          "accept-language": "vi",
        }),
      ),
    ).toBe("fr");
  });

  test("falls back to X-Locale", () => {
    expect(
      resolveAuthLocale(
        request("https://example.com/api/auth/sign-in", {
          "x-locale": "vi",
          "accept-language": "fr",
        }),
      ),
    ).toBe("vi");
  });

  test("uses Accept-Language with regional fallback", () => {
    expect(
      resolveAuthLocale(
        request("https://example.com/api/auth/sign-in", {
          "accept-language": "fr-CA,fr;q=0.9,en;q=0.8",
        }),
      ),
    ).toBe("fr");
  });

  test("defaults to the configured default locale", () => {
    expect(resolveAuthLocale(request("https://example.com/api/auth/sign-in"))).toBe("en");
  });
});

describe("localizeAuthResponse", () => {
  test("adds a localized message to a Better Auth code body", async () => {
    const response = await localizeAuthResponse(
      jsonResponse({ code: "INVALID_EMAIL_OR_PASSWORD" }, 401),
      request("https://example.com/api/auth/sign-in", { "x-locale": "vi" }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      code: "INVALID_EMAIL_OR_PASSWORD",
      message: "Email hoặc mật khẩu không đúng.",
    });
    expect(response.headers.get("vary")).toContain("Accept-Language");
  });

  test("localizes a bare 429 body", async () => {
    const response = await localizeAuthResponse(
      jsonResponse({ message: "Too many requests. Please try again later." }, 429),
      request("https://example.com/api/auth/sign-in", { "x-locale": "fr" }),
    );

    await expect(response.json()).resolves.toEqual({
      message: "Trop de requêtes. Réessayez plus tard.",
    });
  });

  test("localizes an error-string body", async () => {
    const response = await localizeAuthResponse(
      jsonResponse({ error: "not_found" }, 404),
      request("https://example.com/api/auth/sign-in?locale=fr"),
    );

    await expect(response.json()).resolves.toEqual({ error: "not_found", message: "Introuvable." });
  });

  test("keeps an authored message", async () => {
    const response = await localizeAuthResponse(
      jsonResponse({ error: "not_found", message: "Custom" }, 404),
      request("https://example.com/api/auth/sign-in?locale=fr"),
    );

    await expect(response.json()).resolves.toEqual({ error: "not_found", message: "Custom" });
  });

  test("passes through successes and non-JSON responses", async () => {
    const success = jsonResponse({ status: "success" }, 200);
    const plain = new Response("plain", { status: 500, headers: { "content-type": "text/plain" } });
    const req = request("https://example.com/api/auth/get-session");

    expect(await localizeAuthResponse(success, req)).toBe(success);
    expect(await localizeAuthResponse(plain, req)).toBe(plain);
  });
});

describe("generated API message catalog", () => {
  test("matches authored dictionaries for every code and locale", () => {
    const all = { en: enMessages, fr: frMessages, vi: viMessages };

    for (const locale of ["en", "fr", "vi"] as const) {
      const expected = all[locale].sharedApiMessages;

      expect(authMessage("not_found", locale)).toBe(expected.not_found);
      expect(authMessage("INVALID_EMAIL_OR_PASSWORD", locale)).toBe(
        expected.INVALID_EMAIL_OR_PASSWORD,
      );
    }
  });
});
