// @boundary client
import { encodeQR } from "qr";

import { authClient } from "./client";
import { resetSharedSession } from "./session";

export type TwoFactorMethod = "totp" | "email" | "backup";

/** Return `null` on success, otherwise the auth API's message. */
function errorMessage(error: { message?: string | undefined } | null) {
  return error === null ? null : (error.message ?? "Verification failed");
}

type VerifyResult = Promise<{ error: { message?: string | undefined } | null }>;

interface VerifyBody {
  code: string;
  trustDevice: boolean;
}

const VERIFY: Record<TwoFactorMethod, (body: VerifyBody) => VerifyResult> = {
  totp: (body) => authClient.twoFactor.verifyTotp(body),
  email: (body) => authClient.twoFactor.verifyOtp(body),
  backup: (body) => authClient.twoFactor.verifyBackupCode(body),
};

/** Finish a two-factor sign-in with an authenticator, emailed, or backup code. */
export async function verifyTwoFactor(input: {
  method: TwoFactorMethod;
  code: string;
  trustDevice: boolean;
}): Promise<string | null> {
  const body = { code: input.code, trustDevice: input.trustDevice };
  const { error } = await VERIFY[input.method](body);

  if (error === null) {
    resetSharedSession();
  }

  return errorMessage(error);
}

/** Email a one-time sign-in code during the second step. */
export async function sendTwoFactorEmail(): Promise<string | null> {
  const { error } = await authClient.twoFactor.sendOtp();
  return errorMessage(error);
}

export interface Enrollment {
  qrSvg: string;
  secret: string;
  backupCodes: string[];
}

/** Start enrollment: returns the TOTP QR code and one-time backup codes. */
export async function startEnrollment(password: string): Promise<Enrollment | string> {
  const { data, error } = await authClient.twoFactor.enable({ password });

  if (error !== null || !("totpURI" in data)) {
    return errorMessage(error) ?? "";
  }

  // The QR code is rendered locally so the secret never leaves the browser.
  const secret = new URL(data.totpURI).searchParams.get("secret") ?? "";

  return {
    qrSvg: encodeQR(data.totpURI, "svg", { ecc: "medium", border: 2 }),
    secret,
    backupCodes: data.backupCodes,
  };
}

/** Confirm enrollment with the first authenticator code. */
export async function confirmEnrollment(code: string): Promise<string | null> {
  const { error } = await authClient.twoFactor.verifyTotp({ code });

  if (error === null) {
    resetSharedSession();
  }

  return errorMessage(error);
}
