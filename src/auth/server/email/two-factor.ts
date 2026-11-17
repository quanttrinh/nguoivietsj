// @boundary server
import { isEmailConfigured, sendEmail } from "~/server/services/email";
import { enqueueEmail } from "~/server/services/email/queue";
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

/** Deliver a queued two-factor sign-in code. */
export function handleTwoFactorCodeEmail(job: TwoFactorCodeEmailJob, env: Env): Promise<void> {
  return sendTwoFactorCodeEmail(env, {
    to: job.email,
    code: job.code,
    expiresMinutes: job.expiresMinutes,
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
