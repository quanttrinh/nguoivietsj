// @boundary client
import { authClient } from "./client";
import { resetSharedSession } from "./session";

export type SignInResult =
  | { status: "code-sent" }
  | { status: "signed-in" }
  | { status: "error"; message: string };

function localeOptions(locale?: string) {
  return locale === undefined ? {} : { fetchOptions: { headers: { "x-locale": locale } } };
}

/** Request a one-time sign-in code for an existing staff email. */
export async function sendSignInCode(input: {
  email: string;
  locale?: string;
}): Promise<SignInResult> {
  const { error } = await authClient.emailOtp.sendVerificationOtp({
    email: input.email,
    type: "sign-in",
    ...localeOptions(input.locale),
  });

  return error === null
    ? { status: "code-sent" }
    : { status: "error", message: error.message ?? "Unable to send sign-in code" };
}

/** Finish sign-in with the emailed one-time code. */
export async function signInWithCode(input: {
  email: string;
  code: string;
  locale?: string;
}): Promise<SignInResult> {
  const { error } = await authClient.signIn.emailOtp({
    email: input.email,
    otp: input.code,
    ...localeOptions(input.locale),
  });

  if (error !== null) {
    return { status: "error", message: error.message ?? "Unable to sign in" };
  }

  resetSharedSession();
  return { status: "signed-in" };
}
