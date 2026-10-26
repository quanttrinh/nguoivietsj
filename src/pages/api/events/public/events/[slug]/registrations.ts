import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { Effect, Result } from "effect";

import { createEngineDb } from "~/db/events";
import { REGISTRATION_TURNSTILE_ACTION } from "~/events/domain/form-schema/constants";
import { toRegistrationInput } from "~/events/domain/input";
import { registrationSchema } from "~/events/domain/validation";
import { statusPageUrl } from "~/events/server/email";
import { enqueueRegistrationReceivedEmail } from "~/events/server/email-queue";
import { json } from "~/events/server/http";
import { enforceRegistrationRateLimit } from "~/events/server/rate-limit";
import { createRegistration } from "~/events/server/registration-service";
import { eventSlugFromParams } from "~/shared/server/api/params";
import { eventNotFound, invalidEventSlug } from "~/shared/server/api/responses";
import { withSameOriginRoute, withValidatedBody } from "~/shared/server/api/route-decorators";
import { verifyTurnstile } from "~/shared/server/turnstile/server";

export const prerender = false;

export const POST: APIRoute = withSameOriginRoute(
  withValidatedBody(
    registrationSchema,
    async ({ params, request }, body) => {
      const slug = eventSlugFromParams(params);

      if (slug === null) {
        return invalidEventSlug();
      }

      const challenge = await verifyTurnstile(
        request,
        body.turnstileToken,
        REGISTRATION_TURNSTILE_ACTION,
      );

      if (challenge !== null) {
        return challenge;
      }

      const db = createEngineDb(env.EVENT_ENGINE_DB);
      const detail = await db.events.findPublicDetailBySlug(slug, new Date().toISOString());

      if (detail === null) {
        return eventNotFound();
      }

      const registrationEffect = createRegistration({
        db,
        event: detail,
        registration: toRegistrationInput(body),
        enforceRegistrationOpen: true,
      });
      const outcome = await Effect.runPromise(Effect.result(registrationEffect));

      if (Result.isFailure(outcome)) {
        const error = outcome.failure.error;

        return json(
          {
            error: error.error,
            ...(error.fields === undefined ? {} : { fields: error.fields }),
            ...(error.issues === undefined ? {} : { issues: error.issues }),
          },
          error.status,
        );
      }

      const registration = outcome.success;

      const metadataLocale = body.metadata?.locale;
      const locale =
        typeof metadataLocale === "string" && metadataLocale.length > 0
          ? metadataLocale
          : detail.defaultLocale;
      const statusUrl = statusPageUrl(
        new URL(request.url).origin,
        locale,
        registration.statusToken,
      );
      const emailQueued = await enqueueRegistrationReceivedEmail(env, {
        eventId: detail.id,
        registrationId: registration.id,
        statusUrl,
        amountMinor: registration.amountMinor,
      });

      return json(
        {
          registration: { ...registration, statusUrl },
          emailQueued,
        },
        201,
      );
    },
    ({ request }) => enforceRegistrationRateLimit(request),
  ),
);
