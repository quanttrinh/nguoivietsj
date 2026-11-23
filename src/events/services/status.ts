// @boundary server
import { base64url } from "jose";

import type { RegistrationStatusRepository } from "~/db/events/registration-status";
import {
  STATUS_OTP_CODE_LENGTH,
  STATUS_OTP_CODE_REGEX,
  STATUS_OTP_DAILY_MAX,
  STATUS_OTP_DAILY_WINDOW_SECONDS,
  STATUS_OTP_MAX_ATTEMPTS,
  STATUS_OTP_RESEND_SECONDS,
  STATUS_OTP_TOKEN_TTL_SECONDS,
  STATUS_OTP_TTL_SECONDS,
  STATUS_TOKEN_TTL_SECONDS,
} from "~/events/domain/status";
import { TEXT_ENCODER } from "~/shared/utils/text-coding";
import { newId } from "~/shared/utils/uuid";

async function digest(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", TEXT_ENCODER.encode(value));

  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Hash an opaque status token before storing or comparing it. */
export function hashStatusToken(token: string): Promise<string> {
  return digest(token);
}

function digestOtp(registrationId: string, code: string) {
  return digest(`${registrationId}:${code}`);
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }

  let difference = 0;

  for (let index = 0; index < left.length; index += 1) {
    // oxlint-disable-next-line eslint/no-bitwise -- constant-time comparison.
    difference |= (left.codePointAt(index) ?? 0) ^ (right.codePointAt(index) ?? 0);
  }

  return difference === 0;
}

export type StatusOtpFailureReason = "rate_limited" | "missing" | "expired" | "locked" | "invalid";

export type StatusOtpIssue =
  | { ok: true; otp: { id: string; code: string; expiresAt: string } }
  | { ok: false; reason: StatusOtpFailureReason };

export interface StatusToken {
  token: string;
  hash: string;
  expiresAt: string;
}

export type StatusVerifyResult =
  | { ok: true; token: StatusToken }
  | { ok: false; reason: StatusOtpFailureReason };

function generateOtpCode() {
  const range = 10 ** STATUS_OTP_CODE_LENGTH;
  const limit = Math.floor(4_294_967_296 / range) * range;
  const buffer = new Uint32Array(1);

  for (;;) {
    crypto.getRandomValues(buffer);
    const value = buffer[0] ?? 0;

    if (value < limit) {
      return String(value % range).padStart(STATUS_OTP_CODE_LENGTH, "0");
    }
  }
}

/** Create an opaque, non-guessable status-page token. */
export async function makeStatusToken(
  ttlSeconds: number = STATUS_TOKEN_TTL_SECONDS,
): Promise<StatusToken> {
  const token = base64url.encode(crypto.getRandomValues(new Uint8Array(32)));

  return {
    token,
    hash: await hashStatusToken(token),
    expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
  };
}

export async function issueStatusOtp(
  repository: RegistrationStatusRepository,
  registrationId: string,
): Promise<StatusOtpIssue> {
  const code = generateOtpCode();
  const id = newId();
  const expiresAt = new Date(Date.now() + STATUS_OTP_TTL_SECONDS * 1000).toISOString();
  const resendSince = new Date(Date.now() - STATUS_OTP_RESEND_SECONDS * 1000).toISOString();
  const dailySince = new Date(Date.now() - STATUS_OTP_DAILY_WINDOW_SECONDS * 1000).toISOString();
  const created = await repository.createOtp({
    id,
    registrationId,
    codeHash: await digestOtp(registrationId, code),
    expiresAt,
    resendSince,
    dailySince,
    maxPerDay: STATUS_OTP_DAILY_MAX,
  });

  return created
    ? { ok: true, otp: { id, code, expiresAt } }
    : { ok: false, reason: "rate_limited" };
}

export async function verifyStatusOtp(
  repository: RegistrationStatusRepository,
  registrationId: string,
  code: string,
): Promise<StatusVerifyResult> {
  const latest = await repository.findLatestOtp(registrationId);

  // oxlint-disable-next-line typescript/prefer-optional-chain -- distinguish a missing row from an unconsumed code.
  if (latest === null || latest.consumedAt !== null) {
    return { ok: false, reason: "missing" };
  }

  if (new Date(latest.expiresAt).getTime() <= Date.now()) {
    return { ok: false, reason: "expired" };
  }

  if (latest.attempts >= STATUS_OTP_MAX_ATTEMPTS) {
    return { ok: false, reason: "locked" };
  }

  if (!STATUS_OTP_CODE_REGEX.test(code)) {
    await repository.incrementOtpAttempts(latest.id);
    return { ok: false, reason: "invalid" };
  }

  const codeHash = await digestOtp(registrationId, code);

  if (!timingSafeEqual(latest.codeHash, codeHash)) {
    await repository.incrementOtpAttempts(latest.id);
    return { ok: false, reason: "invalid" };
  }

  const consumed = await repository.consumeOtp({
    id: latest.id,
    codeHash,
    now: new Date().toISOString(),
    maxAttempts: STATUS_OTP_MAX_ATTEMPTS,
  });

  if (!consumed) {
    return { ok: false, reason: "invalid" };
  }

  const token = await makeStatusToken(STATUS_OTP_TOKEN_TTL_SECONDS);
  await repository.createSession(registrationId, token.hash, token.expiresAt);

  return { ok: true, token };
}

/** Create and persist a new status token for an existing registration. */
export async function issueStatusToken(
  repository: RegistrationStatusRepository,
  registrationId: string,
): Promise<StatusToken> {
  const token = await makeStatusToken();
  await repository.createSession(registrationId, token.hash, token.expiresAt);

  return token;
}
