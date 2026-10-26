import { createEngineDb, type EngineDb } from "~/db/events";
import {
  sendPaymentConfirmedEmail,
  sendRegistrationReceivedEmail,
  sendStatusOtpEmail,
} from "~/events/server/email";
import { isMailtrapConfigured, isMailtrapTemplateConfigured } from "~/shared/server/email/mailtrap";
import { enqueueEmail, type EmailQueueHandler } from "~/shared/server/email/queue";

export const EVENT_EMAIL_JOB = {
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
      expiresMinutes: number;
    };

async function deliverEventEmail(env: Env, db: EngineDb, job: EventEmailJob): Promise<void> {
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

  if (
    job.type !== EVENT_EMAIL_JOB.registrationReceived &&
    job.type !== EVENT_EMAIL_JOB.paymentConfirmed
  ) {
    return;
  }

  const [event, registration] = await Promise.all([
    db.events.findWithLimits(job.eventId),
    db.registrations.findById(job.eventId, job.registrationId),
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

  const payment = await db.payments.findByRegistrationId(job.registrationId);

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

function templateForJob(env: Env, job: EventEmailJob): string {
  if (job.type === EVENT_EMAIL_JOB.registrationReceived) {
    return env.MAILTRAP_REGISTRATION_TEMPLATE_UUID;
  }

  if (job.type === EVENT_EMAIL_JOB.paymentConfirmed) {
    return env.MAILTRAP_PAYMENT_TEMPLATE_UUID;
  }

  return env.MAILTRAP_STATUS_OTP_TEMPLATE_UUID;
}

async function deliverClaimedEmail(env: Env, job: EventEmailJob): Promise<void> {
  const db = createEngineDb(env.EVENT_ENGINE_DB);
  const claimed = await db.emailDeliveries.claim(job.idempotencyKey, job.type);

  if (!claimed) {
    return;
  }

  try {
    await deliverEventEmail(env, db, job);
  } catch (error) {
    await db.emailDeliveries
      .markFailed(job.idempotencyKey, error instanceof Error ? error.message : String(error))
      .catch((markError: unknown) => {
        console.error("Failed to record email delivery failure", markError);
      });
    throw error;
  }

  await db.emailDeliveries.markSent(job.idempotencyKey).catch((error: unknown) => {
    console.error("Failed to mark email as delivered", error);
  });
}

async function enqueueEventEmail(env: Env, job: EventEmailJob): Promise<boolean> {
  if (!isMailtrapConfigured(env) || !isMailtrapTemplateConfigured(templateForJob(env, job))) {
    console.error("Mailtrap email configuration is incomplete", { type: job.type });
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
      console.error("Failed to deliver development email", { type: job.type, error });
      return false;
    }
  }

  console.error("Email queue binding is not configured", { type: job.type });
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
    idempotencyKey: `${EVENT_EMAIL_JOB.statusOtp}:${input.registrationId}:${input.code}`,
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
