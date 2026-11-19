import { Hono } from "hono";
import { describe, expect, test } from "vitest";

import { localizeApiErrors } from "../../../../src/server/middleware/localize-api-errors";
import {
  apiMessage,
  resolveRequestLocale,
} from "../../../../src/server/middleware/localize-api-errors/api-messages";
import { DEFAULT_LOCALE } from "../../../../src/shared/constants/locales";

function request(url: string, headers?: HeadersInit): Request {
  return new Request(url, headers === undefined ? {} : { headers });
}

describe("API locale resolution", () => {
  test("prefers an explicit supported query locale", () => {
    expect(
      resolveRequestLocale(
        request("https://example.com/api/events?locale=fr", {
          "accept-language": "vi",
        }),
      ),
    ).toBe("fr");
  });

  test("falls back to X-Locale", () => {
    expect(
      resolveRequestLocale(
        request("https://example.com/api/events", {
          "x-locale": "vi",
          "accept-language": "fr",
        }),
      ),
    ).toBe("vi");
  });

  test("uses Accept-Language with regional fallback", () => {
    expect(
      resolveRequestLocale(
        request("https://example.com/api/events", {
          "accept-language": "fr-CA,fr;q=0.9,en;q=0.8",
        }),
      ),
    ).toBe("fr");
  });

  test("defaults to DEFAULT_LOCALE", () => {
    expect(resolveRequestLocale(request("https://example.com/api/events"))).toBe(DEFAULT_LOCALE);
  });

  test("ignores unsupported locales", () => {
    expect(resolveRequestLocale(request("https://example.com/api/events?locale=de"))).toBe(
      DEFAULT_LOCALE,
    );
  });
});

describe("localized API messages", () => {
  test("returns a translated message", () => {
    expect(apiMessage("not_found", "fr")).toBe("Introuvable.");
    expect(apiMessage("unauthorized", "vi")).toBe("Cần đăng nhập.");
  });

  test("falls back to the default locale and then the code", () => {
    expect(apiMessage("not_found", "de")).toBe("Not found.");
    expect(apiMessage("unknown_code", "en")).toBe("Something went wrong.");
    expect(apiMessage("unknown_code", "fr")).toBe("Une erreur est survenue.");
  });

  test("adds message to JSON error responses", async () => {
    const app = new Hono();
    app.use(localizeApiErrors());
    app.get("/api/example", (ctx) => ctx.json({ error: "not_found" }, 404));

    const response = await app.request("/api/example?locale=fr");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "not_found",
      message: "Introuvable.",
    });
    expect(response.headers.get("vary")).toContain("Accept-Language");
  });

  test("localizes Better-auth code/message bodies", async () => {
    const app = new Hono();
    app.use(localizeApiErrors());
    app.post("/api/auth/sign-in/email", (ctx) =>
      ctx.json({ code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" }, 401),
    );

    const response = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "x-locale": "vi" },
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      code: "INVALID_EMAIL_OR_PASSWORD",
      message: "Email hoặc mật khẩu không đúng.",
    });
  });

  test("localizes a bare 429 body", async () => {
    const app = new Hono();
    app.use(localizeApiErrors());
    app.post("/api/auth/sign-in/email", (ctx) =>
      ctx.json({ message: "Too many requests. Please try again later." }, 429),
    );

    const response = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "x-locale": "fr" },
    });

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      message: "Trop de requêtes. Réessayez plus tard.",
    });
  });

  test("keeps an explicitly authored message", async () => {
    const app = new Hono();
    app.use(localizeApiErrors());
    app.get("/api/example", (ctx) => ctx.json({ error: "not_found", message: "Custom" }, 404));

    const response = await app.request("/api/example?locale=fr");

    await expect(response.json()).resolves.toEqual({ error: "not_found", message: "Custom" });
  });
});
