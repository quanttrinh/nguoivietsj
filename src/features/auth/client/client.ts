// @boundary client
import { createAuthClient } from "better-auth/client";
import { emailOTPClient } from "better-auth/client/plugins";

import { BETTER_AUTH_BASE_PATH } from "~/features/auth/constants";

/**
 * Better-auth JS client for browser code.
 *
 * The server config lives in `src/features/auth/server/config.ts`, which belongs to the
 * server tsconfig project; importing it here would pull server code into the
 * client type graph. Keep plugins in sync with that file instead.
 */
export const authClient = createAuthClient({
  basePath: BETTER_AUTH_BASE_PATH,
  plugins: [emailOTPClient()],
});
