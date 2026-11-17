// @boundary client
import { authClient } from "./client";
import { clearSharedSession } from "./session";

export type SignInResult =
  | { status: "signed-in" }
  | { status: "two-factor" }
  | { status: "error"; message: string };

/**
 * Sign in with email and password through the Better-auth client.
 *
 * Accounts with two-factor authentication return `two-factor`; finish with
 * `verifyTwoFactor`. Transport failures (offline, 5xx) are rethrown so callers
 * can show an "unavailable" notice.
 */
export async function signInEmail(input: {
  email: string;
  password: string;
  rememberMe?: boolean;
  locale?: string;
}): Promise<SignInResult> {
  const { data, error } = await authClient.signIn.email({
    email: input.email,
    password: input.password,
    rememberMe: input.rememberMe,
    ...(input.locale === undefined
      ? {}
      : { fetchOptions: { headers: { "x-locale": input.locale } } }),
  });

  if (error) {
    return { status: "error", message: error.message ?? "Unable to sign in" };
  }

  if ("twoFactorRedirect" in data && data.twoFactorRedirect === true) {
    return { status: "two-factor" };
  }

  clearSharedSession();
  return { status: "signed-in" };
}
