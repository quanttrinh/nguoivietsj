// @boundary server
import { createPasswordHashers, parsePasswordHashConfig } from "../auth/server/password";

/** Password hashers configured from the CLI environment's secret. */
export function cliPasswordHashers() {
  return createPasswordHashers(parsePasswordHashConfig(process.env.AUTH_PASSWORD_CONFIG));
}
