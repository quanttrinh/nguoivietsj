// @boundary server
import { getEmailDeliveryRepository } from "~/db/events";
import { EmailError, isEmailConfigured, sendEmail } from "~/server/services/email";
import {
  emailFailureReason,
  enqueueEmail,
  NonRetryableEmailError,
} from "~/server/services/email/queue";
import {
  emailTemplateSubject,
  renderEmailTemplate,
  templateValue,
  type EmailTemplateDefinition,
} from "~/server/services/email/template";
import { serverLogger } from "~/shared/server/logger";

import twoFactorCodeHtml from "./templates/two-factor-code.html?raw";
import twoFactorCodeText from "./templates/two-factor-code.txt?raw";

/** Queue job type for app-wide two-factor sign-in codes. */
export const TWO_FACTOR_EMAIL_JOB = "auth.two_factor.code" as const;

export interface TwoFactorCodeEmailJob {
  type: typeof TWO_FACTOR_EMAIL_JOB;
  idempotencyKey: string;
  email: string;
  code: string;
  expiresMinutes: number;
}

const TWO_FACTOR_TEMPLATE: EmailTemplateDefinition = {
  html: twoFactorCodeHtml,
  text: twoFactorCodeText,
  subject: (variables) => `Người Việt SJ sign-in code: ${templateValue(variables, "code")}`,
};

async function sendTwoFactorCodeEmail(
  env: Env,
  input: { to: string; code: string; expiresMinutes: number },
): Promise<void> {
  const variables = {
    code: input.code,
    expires_minutes: input.expiresMinutes,
  };

  await sendEmail(env, {
    to: input.to,
    subject: emailTemplateSubject(TWO_FACTOR_TEMPLATE, variables),
    html: renderEmailTemplate(TWO_FACTOR_TEMPLATE, variables, "html"),
    text: renderEmailTemplate(TWO_FACTOR_TEMPLATE, variables, "text"),
  });
}

/** True when a queued message is an app-level two-factor code email. */
export function isTwoFactorCodeEmailJob(job: { type: string }): job is TwoFactorCodeEmailJob {
  return job.type === TWO_FACTOR_EMAIL_JOB;
}

/**
 * Deliver a queued two-factor sign-in code.
 *
 * Uses the shared email delivery ledger so a queue retry after a successful
 * send does not email the same code again.
 */
export async function handleTwoFactorCodeEmail(
  job: TwoFactorCodeEmailJob,
  env: Env,
): Promise<void> {
  const deliveries = getEmailDeliveryRepository(env.EVENT_ENGINE_DB);
  const claimed = await deliveries.claim(job.idempotencyKey, job.type);

  if (!claimed) {
    return;
  }

  try {
    await sendTwoFactorCodeEmail(env, {
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
          "Failed to record two-factor email delivery failure",
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
      "Failed to mark two-factor email as delivered",
    );
  });
}

/**
 * Queue a two-factor sign-in code. Each send gets its own idempotency key so a
 * retried sign-in request is not deduplicated against an earlier code.
 */
export async function enqueueTwoFactorCodeEmail(
  env: Env,
  input: { email: string; code: string; expiresMinutes: number },
): Promise<boolean> {
  if (!isEmailConfigured(env)) {
    serverLogger.error({ type: TWO_FACTOR_EMAIL_JOB }, "Email configuration is incomplete");
    return false;
  }

  const job: TwoFactorCodeEmailJob = {
    type: TWO_FACTOR_EMAIL_JOB,
    idempotencyKey: `${TWO_FACTOR_EMAIL_JOB}:${crypto.randomUUID()}`,
    email: input.email,
    code: input.code,
    expiresMinutes: input.expiresMinutes,
  };
  const queue = env.EMAIL_QUEUE as Queue<TwoFactorCodeEmailJob> | undefined;

  if (queue !== undefined) {
    const queued = await enqueueEmail(queue, job);

    if (queued || !import.meta.env.DEV) {
      return queued;
    }
  }

  if (import.meta.env.DEV) {
    try {
      await handleTwoFactorCodeEmail(job, env);
      return true;
    } catch (error) {
      serverLogger.error(
        { type: job.type, error: error instanceof Error ? error.name : "email_delivery_failed" },
        "Failed to deliver development two-factor email",
      );
      return false;
    }
  }

  serverLogger.error({ type: job.type }, "Email queue binding is not configured");
  return false;
}
