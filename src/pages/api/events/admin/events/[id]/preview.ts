import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { createEngineDb } from "~/db/events";
import { resolveRegistrationForm } from "~/events/domain/form-schema";
import type { FormSchema } from "~/events/domain/form-schema/types";
import { json } from "~/events/server/http";
import { SUPPORTED_LOCALES } from "~/shared/constants/locales";
import { eventIdFromParams } from "~/shared/server/api/params";
import { eventNotFound, invalidEventId } from "~/shared/server/api/responses";
import { withAdminRoute } from "~/shared/server/api/route-decorators";

export const prerender = false;

export const GET: APIRoute = withAdminRoute(async ({ params, url }) => {
  const id = eventIdFromParams(params);

  if (id === null) {
    return invalidEventId();
  }

  const db = createEngineDb(env.EVENT_ENGINE_DB);
  const event = await db.events.findDetail(id);

  if (event === null) {
    return eventNotFound();
  }

  const requested = url.searchParams.get("version");
  const version = requested === null ? null : Number(requested);
  const formVersion =
    version !== null && Number.isInteger(version) && version > 0
      ? await db.formVersions.findByVersion(id, version)
      : await db.formVersions.findPublished(id);

  if (formVersion === null) {
    return eventNotFound();
  }

  const localeParam = url.searchParams.get("locale");
  const locale =
    localeParam !== null && SUPPORTED_LOCALES.has(localeParam) ? localeParam : event.defaultLocale;
  const form = resolveRegistrationForm({
    event,
    schema: formVersion.schema as unknown as FormSchema,
    formVersion: formVersion.version,
    locale,
  });

  return json({ form }, 200);
});
