// @boundary server
import type { Context } from "hono";

import { statusPageUrl } from "~/features/events/domain/status-paths";
import type { RegistrationResult } from "~/features/events/domain/types";
import { eventMessage } from "~/features/events/server/api/event-errors";
import { enqueueRegistrationReceivedEmail } from "~/features/events/server/services/email-queue";
import { LOCALE_VARY } from "~/platform/contracts/headers";
import { apiSuccess } from "~/platform/server/api/helpers/responses/api-response";

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
        : {
            meta: {
              warnings: [
                {
                  code: "event_registration_email_not_queued",
                  message: eventMessage("event_registration_email_not_queued", input.locale),
                },
              ],
            },
            headers: LOCALE_VARY,
          }),
    },
  );
}
