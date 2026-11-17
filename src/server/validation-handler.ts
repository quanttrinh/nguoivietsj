// @boundary server
import type { Context } from "hono";

import { badRequest } from "./common-responses";

export function defaultValidationHandler(
  result: { success: boolean },
  ctx: Context,
): Response | undefined {
  return result.success ? undefined : badRequest(ctx);
}
