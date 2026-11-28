// @boundary server
import { createEmailSender, EmailError, type EmailSender } from "~/platform/server/email";
import { getEmailDeliveryLedger } from "~/platform/server/email/deliveries";
import {
  emailFailureReason,
  enqueueEmail,
  NonRetryableEmailError,
} from "~/platform/server/email/queue";
import { serverLogger } from "~/platform/server/logger";

/** Queue job type for app-wide email one-time sign-in codes (kept for queue compatibility). */
export const OTP_EMAIL_JOB = "auth.two_factor.code" as const;

export interface OtpEmailJob {
  type: typeof OTP_EMAIL_JOB;
  idempotencyKey: string;
  email: string;
  code: string;
  expiresMinutes: number;
}

type OtpTemplate = "twoFactorCode";

/** The sender identity for OTP emails; the domain comes from the Worker origin. */
const AUTH_EMAIL_FROM = { local: "no-reply", name: "Người Việt SJ" } as const;

/** The single place where the email-OTP template and identity are bound. */
function otpSender(env: Env): EmailSender<OtpTemplate> {
  return createEmailSender(
    env,
    {
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- generated Env types this as `""`; older deployments may omit it.
      twoFactorCode: env.MAILTRAP_TEMPLATE_TWO_FACTOR_CODE ?? "",
    },
    AUTH_EMAIL_FROM,
  );
}

async function sendOtpEmail(env: Env, input: { to: string; code: string; expiresMinutes: number }) {
  await otpSender(env).sendTemplate("twoFactorCode", input.to, {
    code: input.code,
    expires_minutes: input.expiresMinutes,
  });
}

/** True when a queued message is an app-level email-OTP code email. */
export function isOtpEmailJob(job: { type: string }): job is OtpEmailJob {
  return job.type === OTP_EMAIL_JOB;
}

/**
 * Deliver a queued email one-time sign-in code.
 *
 * Uses the shared email delivery ledger so a queue retry after a successful
 * send does not email the same code again.
 */
export async function handleOtpEmail(job: OtpEmailJob, env: Env): Promise<void> {
  const deliveries = getEmailDeliveryLedger(env.APP_DB);
  const claimed = await deliveries.claim(job.idempotencyKey, job.type);

  if (!claimed) {
    return;
  }

  try {
    await sendOtpEmail(env, {
      to: job.email,
      code: job.code,
      expiresMinutes: job.expiresMinutes,
    });
  } catch (error: unknown) {
    await deliveries
      .markFailed(job.idempotencyKey, emailFailureReason(error))
      .catch((markError: unknown) => {
        serverLogger.error(
          { name: markError instanceof Error ? markError.name : typeof markError },
          "Failed to record OTP email delivery failure",
        );
      });

    if (error instanceof EmailError && !error.retryable) {
      throw new NonRetryableEmailError(error.message);
    }

    throw error;
  }

  await deliveries.markSent(job.idempotencyKey).catch((error: unknown) => {
    serverLogger.error(
      { name: error instanceof Error ? error.name : typeof error },
      "Failed to mark OTP email as delivered",
    );
  });
}

/**
 * Queue an email one-time sign-in code. Each send gets its own idempotency key
 * so a retried sign-in request is not deduplicated against an earlier code.
 */
export async function enqueueOtpCodeEmail(
  env: Env,
  input: { email: string; code: string; expiresMinutes: number },
): Promise<boolean> {
  if (!otpSender(env).isConfigured()) {
    serverLogger.error({ type: OTP_EMAIL_JOB }, "Email configuration is incomplete");
    return false;
  }

  const job: OtpEmailJob = {
    type: OTP_EMAIL_JOB,
    idempotencyKey: `${OTP_EMAIL_JOB}:${crypto.randomUUID()}`,
    email: input.email,
    code: input.code,
    expiresMinutes: input.expiresMinutes,
  };
  const queue = env.EMAIL_QUEUE as Queue<OtpEmailJob> | undefined;

  if (queue !== undefined) {
    const queued = await enqueueEmail(queue, job);

    if (queued || !import.meta.env.DEV) {
      return queued;
    }
  }

  if (import.meta.env.DEV) {
    try {
      await handleOtpEmail(job, env);
      return true;
    } catch (error) {
      serverLogger.error(
        { type: job.type, error: error instanceof Error ? error.name : "email_delivery_failed" },
        "Failed to deliver development OTP email",
      );
      return false;
    }
  }

  serverLogger.error({ type: job.type }, "Email queue binding is not configured");
  return false;
}
