// @boundary server
import { sValidator } from "@hono/standard-validator";
import { type } from "arktype";
import { APIError } from "better-auth/api";
import { Hono } from "hono";

import { can } from "~/features/auth/permissions";
import { USER_ROLE } from "~/features/auth/roles";
import { auth } from "~/features/auth/server/auth";
import { requireAuth, requirePermission } from "~/features/auth/server/middleware";
import { LIMITS } from "~/features/events/domain/limits";
import { emailSchema } from "~/features/events/domain/schemas/common";
import type { ApiPaginatedMeta } from "~/platform/contracts/response";
import { apiSuccess } from "~/platform/server/api/helpers/responses/api-response";
import { forbidden } from "~/platform/server/api/helpers/responses/common-responses";
import { sharedApiError } from "~/platform/server/api/helpers/responses/shared-api-error";
import { defaultValidationHandler } from "~/platform/server/api/helpers/validation/validation-handler";
import { serverLogger } from "~/platform/server/logger";
import { isRecord } from "~/platform/utils/records";

const roleSchema = type.valueOf(USER_ROLE);
const passwordSchema = type("12 <= string <= 128");
const nameSchema = type("1 <= string <= 200");
const userIdSchema = type({ userId: "string" });

const createUserSchema = type({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  role: roleSchema,
});

const usersQuerySchema = type({
  "page?": type.pipe(type("string.integer.parse"), type("number.integer >= 1")),
  "q?": "string",
  "field?": type.enumerated("email", "name"),
  "role?": roleSchema,
});

const updateUserSchema = type({
  "name?": nameSchema,
  "email?": emailSchema,
  "role?": roleSchema,
  "password?": passwordSchema,
});

/** Better Auth throws named statuses (e.g. "NOT_FOUND") as well as numbers. */
const NAMED_FAILURE_STATUSES: Record<string, 400 | 401 | 403 | 404 | 409> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
};

function failureStatus(status: number | string): 400 | 401 | 403 | 404 | 409 | 500 {
  if (typeof status === "string") {
    return NAMED_FAILURE_STATUSES[status] ?? 500;
  }

  switch (status) {
    case 400:
    case 401:
    case 403:
    case 404:
    case 409: {
      return status;
    }
    default: {
      return 500;
    }
  }
}

function userFailure(ctx: Parameters<typeof sharedApiError>[0], error: unknown) {
  if (error instanceof APIError) {
    const code =
      isRecord(error.body) && typeof error.body.code === "string"
        ? error.body.code
        : "user_request_failed";
    const message =
      isRecord(error.body) && typeof error.body.message === "string"
        ? error.body.message
        : undefined;

    return sharedApiError(ctx, code, {
      status: failureStatus(error.status),
      ...(message === undefined ? {} : { message }),
    });
  }

  serverLogger.error(
    { name: error instanceof Error ? error.name : typeof error },
    "Admin user operation failed",
  );

  return sharedApiError(ctx, "user_operation_failed", { status: 500 });
}

function userDto(user: {
  id: string;
  name: string;
  email: string;
  role?: string | undefined;
  createdAt: Date;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role ?? USER_ROLE.user,
    createdAt: user.createdAt.toISOString(),
  };
}

export const adminUsers = new Hono<HonoEnv>()
  .use("*", requireAuth)
  .get(
    "/",
    requirePermission({ user: ["list"] }),
    sValidator("query", usersQuerySchema, defaultValidationHandler),
    async (ctx) => {
      const { page: requestedPage = 1, q, field = "email", role } = ctx.req.valid("query");
      const page = requestedPage;
      const pageSize = LIMITS.list.users;
      const query = (q ?? "").trim().slice(0, LIMITS.text.email);

      try {
        const result = await auth(ctx.env).api.listUsers({
          headers: ctx.req.raw.headers,
          query: {
            limit: pageSize,
            offset: (page - 1) * pageSize,
            sortBy: "createdAt",
            sortDirection: "desc",
            ...(query.length === 0
              ? {}
              : {
                  searchValue: query,
                  searchField: field,
                  searchOperator: "contains" as const,
                }),
            ...(role === undefined
              ? {}
              : {
                  filterField: "role",
                  filterValue: role,
                  filterOperator: "eq" as const,
                }),
          },
        });

        return apiSuccess(
          ctx,
          { users: result.users.map(userDto) },
          {
            meta: {
              pagination: {
                page,
                pageSize,
                total: result.total,
                totalPages: Math.max(1, Math.ceil(result.total / pageSize)),
              },
            } satisfies ApiPaginatedMeta,
          },
        );
      } catch (error) {
        return userFailure(ctx, error);
      }
    },
  )
  .post(
    "/",
    requirePermission({ user: ["create"] }),
    sValidator("json", createUserSchema, defaultValidationHandler),
    async (ctx) => {
      const body = ctx.req.valid("json");

      try {
        const result = await auth(ctx.env).api.createUser({
          headers: ctx.req.raw.headers,
          body,
        });

        return apiSuccess(ctx, { user: userDto(result.user) }, { status: 201 });
      } catch (error) {
        return userFailure(ctx, error);
      }
    },
  )
  .patch(
    "/:userId",
    requirePermission({ user: ["update"] }),
    sValidator("param", userIdSchema, defaultValidationHandler),
    sValidator("json", updateUserSchema, defaultValidationHandler),
    async (ctx) => {
      const { userId } = ctx.req.valid("param");
      const body = ctx.req.valid("json");
      const user = ctx.get("user");

      if (body.role !== undefined && !can(user.role, { user: ["set-role"] })) {
        return forbidden(ctx);
      }

      // The acting admin is always an admin, so only a self-demotion can leave
      // the installation without anyone able to manage users.
      if (body.role !== undefined && userId === user.id) {
        return sharedApiError(ctx, "cannot_change_own_role", { status: 400 });
      }

      if (body.password !== undefined && !can(user.role, { user: ["set-password"] })) {
        return forbidden(ctx);
      }

      const authApi = auth(ctx.env).api;
      const data: Record<string, unknown> = {};

      if (body.name !== undefined) {
        data.name = body.name;
      }
      if (body.email !== undefined) {
        data.email = body.email;
      }
      if (body.role !== undefined) {
        data.role = body.role;
      }

      if (Object.keys(data).length === 0 && body.password === undefined) {
        return sharedApiError(ctx, "user_update_empty", { status: 400 });
      }

      try {
        const revokeAfterUpdate =
          (body.role !== undefined || body.password !== undefined) && userId === user.id;

        if ((body.role !== undefined || body.password !== undefined) && !revokeAfterUpdate) {
          await authApi.revokeUserSessions({
            headers: ctx.req.raw.headers,
            body: { userId },
          });
        }

        if (Object.keys(data).length > 0) {
          await authApi.adminUpdateUser({
            headers: ctx.req.raw.headers,
            body: { userId, data },
          });
        }

        if (body.password !== undefined) {
          await authApi.setUserPassword({
            headers: ctx.req.raw.headers,
            body: { userId, newPassword: body.password },
          });
        }

        if (revokeAfterUpdate) {
          await authApi.revokeUserSessions({
            headers: ctx.req.raw.headers,
            body: { userId },
          });
        }

        return apiSuccess(ctx, { updated: true });
      } catch (error) {
        return userFailure(ctx, error);
      }
    },
  )
  .delete(
    "/:userId",
    requirePermission({ user: ["delete"] }),
    sValidator("param", userIdSchema, defaultValidationHandler),
    async (ctx) => {
      const { userId } = ctx.req.valid("param");

      try {
        await auth(ctx.env).api.removeUser({
          headers: ctx.req.raw.headers,
          body: { userId },
        });

        return apiSuccess(ctx, { removed: true });
      } catch (error) {
        return userFailure(ctx, error);
      }
    },
  );
