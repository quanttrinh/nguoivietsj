import { Hono } from "hono";
import { describe, expect, test } from "vitest";

import {
  apiError,
  apiPartial,
  apiSuccess,
} from "../../../src/server/helpers/responses/api-response";

const app = new Hono()
  .get("/success", (ctx) => apiSuccess(ctx, { value: 1 }))
  .get("/pagination", (ctx) =>
    apiSuccess(
      ctx,
      { items: [] },
      { meta: { pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 } } },
    ),
  )
  .get("/error", (ctx) =>
    apiError(ctx, "invalid_payload", {
      status: 400,
      fields: ["name"],
      message: "Some fields are invalid.",
    }),
  )
  .get("/partial", (ctx) =>
    apiPartial(
      ctx,
      { created: 1 },
      { code: "partial_failure", message: "Partial failure.", issues: [{ code: "row_failed" }] },
    ),
  );

describe("standard API response envelope", () => {
  test("returns a success envelope", async () => {
    const response = await app.request("/success");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "success",
      data: { value: 1 },
      error: null,
      meta: {},
    });
  });

  test("returns pagination in meta", async () => {
    const response = await app.request("/pagination");

    await expect(response.json()).resolves.toEqual({
      status: "success",
      data: { items: [] },
      error: null,
      meta: { pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 } },
    });
  });

  test("returns an error envelope", async () => {
    const response = await app.request("/error");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      status: "error",
      data: null,
      error: { code: "invalid_payload", message: "Some fields are invalid.", fields: ["name"] },
      meta: {},
    });
  });

  test("returns a partial envelope", async () => {
    const response = await app.request("/partial");

    expect(response.status).toBe(207);
    await expect(response.json()).resolves.toEqual({
      status: "partial",
      data: { created: 1 },
      error: {
        code: "partial_failure",
        message: "Partial failure.",
        issues: [{ code: "row_failed" }],
      },
      meta: {},
    });
  });
});
