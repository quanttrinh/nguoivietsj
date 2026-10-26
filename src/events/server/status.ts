import { Data, Effect } from "effect";
import { base64url } from "jose";

import type { RegistrationStatusRepository } from "~/db/events/registration-status";
import { STATUS_OTP_CODE_LENGTH } from "~/shared/constants/limits";
import { statusOtpCodeRegex } from "~/shared/constants/patterns";

const ENCODER = new TextEncoder();
export const STATUS_TOKEN_TTL_SECONDS = 365 * 24 * 60 * 60;
export const STATUS_OTP_TTL_SECONDS = 10 * 60;
export const STATUS_OTP_MAX_ATTEMPTS = 5;
export const STATUS_OTP_RESEND_SECONDS = 60;

async function digest(value: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", ENCODER.encode(value));

  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Hash an opaque status token before storing or comparing it. */
export function hashStatusToken(token: string): Promise<string> {
  return digest(token);
}

function digestOtp(registrationId: string, code: string): Promise<string> {
  return digest(`${registrationId}:${code}`);
}

function timingSafeEqual(left: string, right: string): boolean {
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

export interface StatusOtpIssue {
  code: string;
  expiresAt: string;
}

/** OTP issuance or verification failed for a specific reason. */
export class StatusOtpFailure extends Data.TaggedError("StatusOtpFailure")<{
  readonly reason: "rate_limited" | "missing" | "expired" | "locked" | "invalid";
}> {}

export function issueStatusOtp(
  repository: RegistrationStatusRepository,
  registrationId: string,
): Effect.Effect<StatusOtpIssue, StatusOtpFailure> {
  return Effect.gen(function* issueOtpProgram() {
    const random = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
    const code = String(random % 10 ** STATUS_OTP_CODE_LENGTH).padStart(
      STATUS_OTP_CODE_LENGTH,
      "0",
    );
    const expiresAt = new Date(Date.now() + STATUS_OTP_TTL_SECONDS * 1000).toISOString();
    const resendSince = new Date(Date.now() - STATUS_OTP_RESEND_SECONDS * 1000).toISOString();
    const codeHash = yield* Effect.promise(() => digestOtp(registrationId, code));
    const created = yield* Effect.promise(() =>
      repository.createOtp({
        registrationId,
        codeHash,
        expiresAt,
        resendSince,
      }),
    );

    if (!created) {
      return yield* Effect.fail(new StatusOtpFailure({ reason: "rate_limited" }));
    }

    return { code, expiresAt };
  });
}

export interface StatusToken {
  token: string;
  hash: string;
  expiresAt: string;
}

/** Create an opaque, non-guessable status-page token. */
export async function makeStatusToken(): Promise<StatusToken> {
  const token = base64url.encode(crypto.getRandomValues(new Uint8Array(32)));

  return {
    token,
    hash: await hashStatusToken(token),
    expiresAt: new Date(Date.now() + STATUS_TOKEN_TTL_SECONDS * 1000).toISOString(),
  };
}

export function verifyStatusOtp(
  repository: RegistrationStatusRepository,
  registrationId: string,
  code: string,
): Effect.Effect<StatusToken, StatusOtpFailure> {
  return Effect.gen(function* verifyOtpProgram() {
    const latest = yield* Effect.promise(() => repository.findLatestOtp(registrationId));

    if (latest?.consumed_at !== null) {
      return yield* Effect.fail(new StatusOtpFailure({ reason: "missing" }));
    }

    if (new Date(latest.expires_at).getTime() <= Date.now()) {
      return yield* Effect.fail(new StatusOtpFailure({ reason: "expired" }));
    }

    if (latest.attempts >= STATUS_OTP_MAX_ATTEMPTS) {
      return yield* Effect.fail(new StatusOtpFailure({ reason: "locked" }));
    }

    if (!statusOtpCodeRegex(STATUS_OTP_CODE_LENGTH).test(code)) {
      yield* Effect.promise(() => repository.incrementOtpAttempts(latest.id));
      return yield* Effect.fail(new StatusOtpFailure({ reason: "invalid" }));
    }

    const codeHash = yield* Effect.promise(() => digestOtp(registrationId, code));

    if (!timingSafeEqual(latest.code_hash, codeHash)) {
      yield* Effect.promise(() => repository.incrementOtpAttempts(latest.id));
      return yield* Effect.fail(new StatusOtpFailure({ reason: "invalid" }));
    }

    const consumed = yield* Effect.promise(() =>
      repository.consumeOtp({
        id: latest.id,
        codeHash,
        now: new Date().toISOString(),
        maxAttempts: STATUS_OTP_MAX_ATTEMPTS,
      }),
    );

    if (!consumed) {
      return yield* Effect.fail(new StatusOtpFailure({ reason: "invalid" }));
    }

    const token = yield* Effect.promise(() => makeStatusToken());

    yield* Effect.promise(() =>
      repository.createSession(registrationId, token.hash, token.expiresAt),
    );

    return token;
  });
}

/** Create and persist a new status token for an existing registration. */
export function issueStatusToken(
  repository: RegistrationStatusRepository,
  registrationId: string,
): Effect.Effect<StatusToken> {
  return Effect.gen(function* issueTokenProgram() {
    const token = yield* Effect.promise(() => makeStatusToken());

    yield* Effect.promise(() =>
      repository.createSession(registrationId, token.hash, token.expiresAt),
    );

    return token;
  });
}
