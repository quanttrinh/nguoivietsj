// @boundary server
import type { Context } from "hono";

import type { ApiIssue } from "~/platform/contracts/response";

import { sharedApiError } from "../responses/shared-api-error";

/**
 * Shape of the failure hook result passed by `@hono/standard-validator`: the
 * `error` array holds Standard Schema issues (ArkType adds a `code`).
 */
type ValidationPathSegment = PropertyKey | { readonly key: PropertyKey };

interface ValidationIssue {
  readonly message: string;
  readonly path?: readonly ValidationPathSegment[] | undefined;
  readonly code?: string | undefined;
}

type ValidationResult =
  | { readonly success: true; readonly data: unknown; readonly target: string }
  | {
      readonly success: false;
      readonly error: readonly ValidationIssue[];
      readonly data: unknown;
      readonly target: string;
    };

/** Join a Standard Schema issue path into the field name used by the API contract. */
function issuePath(issue: ValidationIssue) {
  if (issue.path === undefined || issue.path.length === 0) {
    return undefined;
  }

  return issue.path
    .map((segment) => String(typeof segment === "object" ? segment.key : segment))
    .join(".");
}

export function defaultValidationHandler(
  result: ValidationResult,
  ctx: Context,
): Response | undefined {
  if (result.success) {
    return undefined;
  }

  const fields: string[] = [];
  const issues: ApiIssue[] = result.error.map((issue) => {
    const path = issuePath(issue);

    if (path !== undefined && !fields.includes(path)) {
      fields.push(path);
    }

    return {
      code: issue.code !== undefined && issue.code.length > 0 ? issue.code : "validation_failed",
      ...(path === undefined ? {} : { path }),
    };
  });

  return sharedApiError(ctx, "bad_request", { status: 400, fields, issues });
}
