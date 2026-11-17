/* oxlint-disable import/no-default-export -- Better Auth CLI expects a default export. */
import { betterAuth } from "better-auth";

import { baseAuthConfig } from "./src/auth/server/config";

/** CLI-only Better Auth instance used by `bun run auth:generate`. */
export const auth = betterAuth(baseAuthConfig);
export default auth;
