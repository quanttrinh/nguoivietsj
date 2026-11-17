import { betterAuth } from "better-auth";

import { baseAuthConfig } from "./src/auth/server/config";

/** CLI-only Better Auth instance used by `bun run auth:generate`. */
export const auth = betterAuth(baseAuthConfig);
export default auth;
