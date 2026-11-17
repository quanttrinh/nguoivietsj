// @boundary server
import {
  getEmailDeliveryRepository,
  getEventRepository,
  getPaymentRepository,
  getRegistrationRepository,
} from "~/db/events";
import {
  sendPaymentConfirmedEmail,
  sendRegistrationReceivedEmail,
  sendStatusOtpEmail,
} from "~/events/services/email";
import { EmailError, isEmailConfigured } from "~/server/services/email";
import {
  enqueueEmail,
  NonRetryableEmailError,
  type EmailQueueHandler,
} from "~/server/services/email/queue";
import { serverLogger } from "~/shared/server/logger";

const EVENT_EMAIL_JOB = {
  registrationReceived: "event.registration.received",
  paymentConfirmed: "event.payment.confirmed",
  statusOtp: "event.status.otp",
} as const;

export type EventEmailJob =
  | {
      type: typeof EVENT_EMAIL_JOB.registrationReceived;
      idempotencyKey: string;
      eventId: string;
      registrationId: string;
      statusUrl: string;
      amountMinor: number;
    }
  | {
      type: typeof EVENT_EMAIL_JOB.paymentConfirmed;
      idempotencyKey: string;
      eventId: string;
      registrationId: string;
      paymentId: string;
      statusUrl: string;
    }
  | {
      type: typeof EVENT_EMAIL_JOB.statusOtp;
      idempotencyKey: string;
      email: string;
      code: string;
      registrationId: string;
      otpId: string;
      expiresMinutes: number;
    };

/** Persist/log only non-PII diagnostic information for a failed delivery. */
function emailFailureReason(error: unknown): string {
  if (error instanceof EmailError) {
    return error.status === 0 ? error.message : `${error.provider}_status_${error.status}`;
  }

  return error instanceof Error ? error.name : "email_delivery_failed";
}

async function deliverEventEmail(env: Env, job: EventEmailJob): Promise<void> {
  const engineDb = env.EVENT_ENGINE_DB;

  if (job.type === EVENT_EMAIL_JOB.statusOtp) {
    if (typeof job.email !== "string" || typeof job.code !== "string") {
      return;
    }

    await sendStatusOtpEmail({
      env,
      to: job.email,
      code: job.code,
      registrationId: job.registrationId,
      expiresMinutes: typeof job.expiresMinutes === "number" ? job.expiresMinutes : 10,
    });
    return;
  }

  const [event, registration] = await Promise.all([
    getEventRepository(engineDb).findWithLimits(job.eventId),
    getRegistrationRepository(engineDb).findById(job.eventId, job.registrationId),
  ]);

  if (event === null || registration === null) {
    return;
  }

  if (job.type === EVENT_EMAIL_JOB.registrationReceived) {
    await sendRegistrationReceivedEmail({
      env,
      event,
      registration,
      statusUrl: job.statusUrl,
      amountMinor: job.amountMinor,
    });
    return;
  }

  const payment = await getPaymentRepository(engineDb).findByRegistrationId(job.registrationId);

  if (payment === null) {
    return;
  }

  await sendPaymentConfirmedEmail({
    env,
    event,
    registration,
    payment,
    statusUrl: job.statusUrl,
  });
}

async function deliverClaimedEmail(env: Env, job: EventEmailJob): Promise<void> {
  const engineDb = env.EVENT_ENGINE_DB;
  const claimed = await getEmailDeliveryRepository(engineDb).claim(job.idempotencyKey, job.type);

  if (!claimed) {
    return;
  }

  try {
    await deliverEventEmail(env, job);
  } catch (error) {
    await getEmailDeliveryRepository(engineDb)
      .markFailed(job.idempotencyKey, emailFailureReason(error))
      .catch((markError: unknown) => {
        serverLogger.error(
          { name: markError instanceof Error ? markError.name : typeof markError },
          "Failed to record email delivery failure",
        );
      });

    if (error instanceof EmailError && !error.retryable) {
      throw new NonRetryableEmailError(error.message);
    }

    throw error;
  }

  await getEmailDeliveryRepository(engineDb)
    .markSent(job.idempotencyKey)
    .catch((error: unknown) => {
      serverLogger.error(
        { name: error instanceof Error ? error.name : typeof error },
        "Failed to mark email as delivered",
      );
    });
}

async function enqueueEventEmail(env: Env, job: EventEmailJob): Promise<boolean> {
  if (!isEmailConfigured(env)) {
    serverLogger.error({ type: job.type }, "Email configuration is incomplete");
    return false;
  }

  const queue = env.EMAIL_QUEUE as Queue<EventEmailJob> | undefined;

  if (queue !== undefined) {
    const queued = await enqueueEmail(queue, job);

    if (queued || !import.meta.env.DEV) {
      return queued;
    }
  }

  if (import.meta.env.DEV) {
    try {
      await deliverClaimedEmail(env, job);
      return true;
    } catch (error) {
      serverLogger.error(
        { type: job.type, error: emailFailureReason(error) },
        "Failed to deliver development email",
      );
      return false;
    }
  }

  serverLogger.error({ type: job.type }, "Email queue binding is not configured");
  return false;
}

/** Queue the registration-received email. */
export function enqueueRegistrationReceivedEmail(
  env: Env,
  input: Omit<
    Extract<EventEmailJob, { type: typeof EVENT_EMAIL_JOB.registrationReceived }>,
    "type" | "idempotencyKey"
  >,
): Promise<boolean> {
  return enqueueEventEmail(env, {
    type: EVENT_EMAIL_JOB.registrationReceived,
    idempotencyKey: `${EVENT_EMAIL_JOB.registrationReceived}:${input.registrationId}`,
    ...input,
  });
}

/** Queue the payment-confirmed email. */
export function enqueuePaymentConfirmedEmail(
  env: Env,
  input: Omit<
    Extract<EventEmailJob, { type: typeof EVENT_EMAIL_JOB.paymentConfirmed }>,
    "type" | "idempotencyKey"
  >,
): Promise<boolean> {
  return enqueueEventEmail(env, {
    type: EVENT_EMAIL_JOB.paymentConfirmed,
    idempotencyKey: `${EVENT_EMAIL_JOB.paymentConfirmed}:${input.registrationId}:${input.paymentId}`,
    ...input,
  });
}

/** Queue a status OTP email. */
export function enqueueStatusOtpEmail(
  env: Env,
  input: Omit<
    Extract<EventEmailJob, { type: typeof EVENT_EMAIL_JOB.statusOtp }>,
    "type" | "idempotencyKey"
  >,
): Promise<boolean> {
  return enqueueEventEmail(env, {
    type: EVENT_EMAIL_JOB.statusOtp,
    idempotencyKey: `${EVENT_EMAIL_JOB.statusOtp}:${input.registrationId}:${input.otpId}`,
    ...input,
  });
}

/** Event-engine jobs handled by the shared email queue. */
export const eventEmailQueue: EmailQueueHandler<EventEmailJob> = {
  dedupeKey(job) {
    return job.idempotencyKey;
  },
  handle: (job, env) => deliverClaimedEmail(env, job),
};
