import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { createEngineDb } from "~/db/events";
import { classifyDatabaseError, DATABASE_ERROR } from "~/db/events/errors";
import { FORM_VERSION_STATUS } from "~/events/domain/constants";
import { validateFormSchema } from "~/events/domain/form-schema";
import { MAX_FORM_SCHEMA_BYTES } from "~/events/domain/limits";
import { formVersionCreateSchema } from "~/events/domain/validation";
import { invalidateEventPage } from "~/events/server/cache";
import { json, jsonByteLength } from "~/events/server/http";
import { eventIdFromParams } from "~/shared/server/api/params";
import { eventNotFound, invalidEventId, invalidPayload } from "~/shared/server/api/responses";
import { withAdminRoute, withValidatedBody } from "~/shared/server/api/route-decorators";

export const prerender = false;

export const GET: APIRoute = withAdminRoute(async ({ params }) => {
  const id = eventIdFromParams(params);

  if (id === null) {
    return invalidEventId();
  }

  const db = createEngineDb(env.EVENT_ENGINE_DB);
  const event = await db.events.findDetail(id);

  if (event === null) {
    return eventNotFound();
  }

  const formVersions = await db.formVersions.listByEvent(id);

  return json(
    {
      event,
      formVersions: formVersions.map(({ version, schema }) => ({ version, schema })),
    },
    200,
  );
});

export const POST: APIRoute = withAdminRoute(
  withValidatedBody(formVersionCreateSchema, async ({ cache, locals, params }, body) => {
    const id = eventIdFromParams(params);

    if (id === null) {
      return invalidEventId();
    }

    if (jsonByteLength(body.schema) > MAX_FORM_SCHEMA_BYTES) {
      return invalidPayload(["schema"]);
    }

    const db = createEngineDb(env.EVENT_ENGINE_DB);
    const event = await db.events.findDetail(id);

    if (event === null) {
      return eventNotFound();
    }

    const validation = validateFormSchema(body.schema, {
      mode: body.status === FORM_VERSION_STATUS.published ? "publish" : "draft",
      activeTicketTypeKeys: event.ticketTypes
        .filter((ticketType) => ticketType.active)
        .map((ticketType) => ticketType.key),
    });

    if (validation.errors.length > 0) {
      const fields = [
        ...new Set(validation.errors.map((issue) => issue.path.split(".")[0] ?? issue.path)),
      ];

      return json(
        {
          error: "invalid_form_schema",
          fields,
          issues: validation.errors,
        },
        400,
      );
    }

    try {
      const formVersion = await db.formVersions.create(
        id,
        {
          version: body.version,
          schema: body.schema,
          status: body.status,
        },
        locals.user?.id ?? null,
      );

      if (body.status === FORM_VERSION_STATUS.published) {
        await invalidateEventPage(cache, id);
      }

      return json({ formVersion, warnings: validation.warnings }, 201);
    } catch (error) {
      if (classifyDatabaseError(error).code === DATABASE_ERROR.uniqueConstraint) {
        return json({ error: "form_version_exists" }, 409);
      }

      console.error("Failed to create form version", error);
      return json({ error: "form_version_create_failed" }, 500);
    }
  }),
);
