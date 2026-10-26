// @boundary client
import { authClient } from "./client";
import { clearSharedSession } from "./session";

/**
 * Sign in with email and password through the Better-auth client.
 *
 * Returns `null` on success, otherwise the localized error message from the
 * auth API. Any transport failure (offline, 5xx) is rethrown so callers can
 * show an "unavailable" notice.
 */
export async function signInEmail(input: {
  email: string;
  password: string;
  rememberMe?: boolean;
  locale?: string;
}): Promise<string | null> {
  const { error } = await authClient.signIn.email({
    email: input.email,
    password: input.password,
    rememberMe: input.rememberMe,
    ...(input.locale === undefined
      ? {}
      : { fetchOptions: { headers: { "x-locale": input.locale } } }),
  });

  if (!error) {
    clearSharedSession();
    return null;
  }

  return error.message ?? "Unable to sign in";
}
