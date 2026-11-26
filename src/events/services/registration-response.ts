// @boundary server
import type { Context } from "hono";

import { statusPageUrl } from "~/events/domain/status-paths";
import type { RegistrationResult } from "~/events/domain/types";
import { enqueueRegistrationReceivedEmail } from "~/events/services/email-queue";
import { apiSuccess } from "~/server/helpers/responses/api-response";

/** Shared 201 response for every registration-creation route. */
export async function registrationCreatedResponse(
  ctx: Context,
  input: {
    env: Env;
    eventId: string;
    locale: string;
    registration: RegistrationResult;
  },
) {
  const statusUrl = statusPageUrl(
    new URL(ctx.req.url).origin,
    input.locale,
    input.registration.statusToken,
  );
  const emailQueued = await enqueueRegistrationReceivedEmail(input.env, {
    eventId: input.eventId,
    registrationId: input.registration.id,
    statusUrl,
    amountMinor: input.registration.amountMinor,
  });

  return apiSuccess(
    ctx,
    { registration: { ...input.registration, statusUrl }, emailQueued },
    {
      status: 201,
      ...(emailQueued
        ? {}
        : { meta: { warnings: [{ code: "event_registration_email_not_queued" }] } }),
    },
  );
}
