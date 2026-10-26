// @boundary client
import { createAuthClient } from "better-auth/client";

import { BETTER_AUTH_BASE_PATH } from "~/shared/constants/auth";

/**
 * Better-auth JS client for browser code.
 *
 * The server config lives in `better-auth.config.ts`, which belongs to the
 * server tsconfig project; importing it here would pull server code into the
 * client type graph. Keep options in sync with that file instead.
 */
export const authClient = createAuthClient({
  basePath: BETTER_AUTH_BASE_PATH,
});
