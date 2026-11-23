import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { betterAuth } from "better-auth";

import { baseAuthConfig } from "./src/auth/server/config";

/** CLI-only Better Auth instance used by `bun run auth:schema`. */
export const auth = betterAuth({
  ...baseAuthConfig,
  database: drizzleAdapter({}, { provider: "sqlite" }),
});
export default auth;
