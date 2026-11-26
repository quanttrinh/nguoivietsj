// @boundary server
import { sValidator } from "@hono/standard-validator";
/* oxlint-disable eslint/max-lines, import/max-dependencies -- Admin routes share repository wiring; response types stay inferred for Hono RPC. */
import { type } from "arktype";
import { type Context, Hono } from "hono";

import { can } from "~/features/auth/permissions";
import { requireAuth, requirePermission } from "~/features/auth/server/middleware";
import { FORM_VERSION_STATUS } from "~/features/events/domain/constants";
import { resolvePublishedForm } from "~/features/events/domain/form-schema";
import { validateFormSchema } from "~/features/events/domain/form-schema/validation/validate";
import { LIMITS } from "~/features/events/domain/limits";
import { isRegistrationPaid } from "~/features/events/domain/payment";
import { registrationAmountDue } from "~/features/events/domain/presentation";
import { statusPageUrl } from "~/features/events/domain/status-paths";
import type { TicketTypeInput } from "~/features/events/domain/types";
import { eventCreateSchema, eventUpdateSchema } from "~/features/events/server/schemas/event";
import { formVersionCreateSchema } from "~/features/events/server/schemas/form";
import { paymentSchema } from "~/features/events/server/schemas/payment";
import {
  manualRegistrationSchema,
  registrationSchema,
} from "~/features/events/server/schemas/registration";
import {
  ticketKeySchema,
  ticketTypeSchema,
  ticketTypeUpdateSchema,
} from "~/features/events/server/schemas/tickets";
import { createCheckinQrSvg } from "~/features/events/server/services/checkin-qr";
import { enqueuePaymentConfirmedEmail } from "~/features/events/server/services/email-queue";
import { keysetQueryFields, registrationCursor } from "~/features/events/server/services/keyset";
import { registrationCreatedResponse } from "~/features/events/server/services/registration-response";
import {
  createManualRegistration,
  createRegistration,
  RegistrationFailureError,
} from "~/features/events/server/services/registration-service";
import { loadRegistrationView } from "~/features/events/server/services/registration-view";
import { issueStatusToken } from "~/features/events/server/services/status";
import {
  invalidFields,
  validateEventDates,
  validateEventDetails,
  validateEventFormatting,
  validateEventLocale,
  validateEventNotes,
  validateTicketTypes,
} from "~/features/events/server/validation";
import { SUPPORTED_LOCALES } from "~/platform/i18n";
import { apiSuccess } from "~/platform/server/api/helpers/responses/api-response";
import { defaultValidationHandler } from "~/platform/server/api/helpers/validation/validation-handler";
import {
  getAuditRepository,
  getCheckinRepository,
  getEventRepository,
  getFormVersionRepository,
  getPaymentRepository,
  getRegistrationRepository,
  getRegistrationStatusRepository,
  getTicketTypeRepository,
} from "~/platform/server/db/events";
import { classifyDatabaseError, DATABASE_ERROR } from "~/platform/server/db/events/errors";
import { serverLogger } from "~/platform/server/logger";
import { isRecord } from "~/platform/utils/records";

import { eventApiError } from "./event-errors";
import { registrationFailureResponse } from "./registration-errors";

const eventParamSchema = type({
  eventId: "string.uuid.v7",
});

const eventAndRegistrationParamSchema = type({
  eventId: "string.uuid.v7",
  registrationId: "string.uuid.v7",
});

const eventAndTicketKeyParamSchema = type({
  eventId: "string.uuid.v7",
  key: ticketKeySchema,
});

const pageSchema = type.pipe(
  type("string.integer.parse"),
  type(`number.integer >= 1 & number.integer <= ${LIMITS.list.supportMaxPage}`),
);

const registrationLimitSchema = type.pipe(
  type("string.integer.parse"),
  type(`number.integer >= 1 & number.integer <= ${LIMITS.list.registrations}`),
);

const previewVersionSchema = type.pipe(type("string.integer.parse"), type("number.integer >= 1"));

const eventsQuerySchema = type({
  "page?": pageSchema,
});

const supportQuerySchema = type({
  "q?": "string",
  "payment?": type.enumerated("paid", "unpaid"),
  "checkin?": type.enumerated("checked_in", "not_checked_in"),
  ...keysetQueryFields,
});

const previewQuerySchema = type({
  "version?": previewVersionSchema,
  "locale?": "string",
});

const registrationListQuerySchema = type({
  "limit?": registrationLimitSchema,
});

function eventNotFound(ctx: Context) {
  return eventApiError(ctx, "event_not_found", {
    status: 404,
  });
}

function registrationNotFound(ctx: Context) {
  return eventApiError(ctx, "event_registration_not_found", {
    status: 404,
  });
}

function invalidPayload(ctx: Context, fields: string[]) {
  return eventApiError(ctx, "event_invalid_payload", {
    status: 400,
    fields,
  });
}

function formNotFound(ctx: Context) {
  return eventApiError(ctx, "event_form_not_found", {
    status: 404,
  });
}

function invalidFormSchema(ctx: Context) {
  return eventApiError(ctx, "event_invalid_form_schema", {
    status: 400,
  });
}

function placesTicketType(schema: Record<string, unknown>, key: string) {
  const fields = schema.fields;

  if (!Array.isArray(fields)) {
    return false;
  }

  return fields.some((field) => isRecord(field) && field.ref === `system.tickets.${key}`);
}

function mergeTicketType(
  current: TicketTypeInput,
  body: Partial<TicketTypeInput>,
): TicketTypeInput {
  return {
    key: current.key,
    label: body.label ?? current.label,
    description: body.description === undefined ? current.description : body.description,
    priceMinor: body.priceMinor ?? current.priceMinor,
    minPerRegistration: body.minPerRegistration ?? current.minPerRegistration,
    maxPerRegistration:
      body.maxPerRegistration === undefined ? current.maxPerRegistration : body.maxPerRegistration,
    defaultQuantity: body.defaultQuantity ?? current.defaultQuantity,
    capacity: body.capacity === undefined ? current.capacity : body.capacity,
    active: body.active ?? current.active,
    sortOrder: body.sortOrder ?? current.sortOrder,
  };
}

export const adminEvents = new Hono<HonoEnv>()
  .use("*", requireAuth)
  .get(
    "/",
    requirePermission({ event: ["list"] }),
    sValidator("query", eventsQuerySchema, defaultValidationHandler),
    async (ctx) => {
      const page = ctx.req.valid("query").page ?? 1;
      const pageSize = LIMITS.list.events;
      const result = await getEventRepository(ctx.env.EVENT_ENGINE_DB).list({
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });

      return apiSuccess(
        ctx,
        { role: ctx.get("user").role, events: result.events },
        {
          meta: {
            pagination: {
              page,
              pageSize,
              total: result.total,
              totalPages: Math.max(1, Math.ceil(result.total / pageSize)),
            },
          },
        },
      );
    },
  )
  .post(
    "/",
    requirePermission({ event: ["create"] }),
    sValidator("json", eventCreateSchema, defaultValidationHandler),
    async (ctx) => {
      const input = ctx.req.valid("json");
      const detailFields = [
        ...validateEventFormatting({
          timezone: input.timezone,
          currency: input.limits.currency,
        }),
        ...validateEventDetails(input.location, input.payments),
        ...validateEventLocale({
          defaultLocale: input.defaultLocale,
          title: input.title,
          aliases: input.aliases,
          slug: input.slug,
        }),
        ...validateEventNotes(input.notes),
      ];

      if (detailFields.length > 0) {
        return invalidPayload(ctx, detailFields);
      }

      const ticketFields = validateTicketTypes(input.ticketTypes);

      if (ticketFields.length > 0) {
        return invalidPayload(ctx, ticketFields);
      }

      try {
        const event = await getEventRepository(ctx.env.EVENT_ENGINE_DB).create(input);

        return apiSuccess(ctx, { event }, { status: 201 });
      } catch (error) {
        const databaseCode = classifyDatabaseError(error).code;

        if (
          databaseCode === DATABASE_ERROR.eventConflict ||
          databaseCode === DATABASE_ERROR.uniqueConstraint
        ) {
          return eventApiError(ctx, "event_exists", {
            status: 409,
          });
        }

        serverLogger.error(error, "Failed to create event");
        return eventApiError(ctx, "event_create_failed", {
          status: 500,
        });
      }
    },
  )
  .get(
    "/:eventId",
    requirePermission({ event: ["read"] }),
    sValidator("param", eventParamSchema, defaultValidationHandler),
    async (ctx) => {
      const { eventId } = ctx.req.valid("param");

      const event = await getEventRepository(ctx.env.EVENT_ENGINE_DB).findDetail(eventId);

      return event === null ? eventNotFound(ctx) : apiSuccess(ctx, { event });
    },
  )
  .patch(
    "/:eventId",
    requirePermission({ event: ["update"] }),
    sValidator("param", eventParamSchema, defaultValidationHandler),
    sValidator("json", eventUpdateSchema, defaultValidationHandler),
    async (ctx) => {
      const { eventId } = ctx.req.valid("param");
      const body = ctx.req.valid("json");
      const engineDb = ctx.env.EVENT_ENGINE_DB;
      const current = await getEventRepository(engineDb).findDetail(eventId);

      if (current === null) {
        return eventNotFound(ctx);
      }

      const startsAt = body.startsAt === undefined ? current.startsAt : body.startsAt;
      const endsAt = body.endsAt === undefined ? current.endsAt : body.endsAt;

      if (!validateEventDates(startsAt, endsAt)) {
        return invalidPayload(ctx, ["startsAt", "endsAt"]);
      }

      const detailFields = [
        ...validateEventFormatting({
          timezone: body.timezone ?? current.timezone,
          currency: body.limits?.currency ?? current.limits.currency,
        }),
        ...validateEventDetails(body.location, body.payments),
        ...validateEventLocale({
          defaultLocale: body.defaultLocale ?? current.defaultLocale,
          title: body.title ?? current.title,
          aliases: body.aliases ?? current.aliases,
          slug: current.slug,
        }),
        ...validateEventNotes(body.notes),
      ];

      if (detailFields.length > 0) {
        return invalidPayload(ctx, detailFields);
      }

      try {
        const event = await getEventRepository(engineDb).update(eventId, body);

        return event === null ? eventNotFound(ctx) : apiSuccess(ctx, { event });
      } catch (error) {
        const databaseCode = classifyDatabaseError(error).code;

        if (
          databaseCode === DATABASE_ERROR.eventConflict ||
          databaseCode === DATABASE_ERROR.uniqueConstraint
        ) {
          return eventApiError(ctx, "event_exists", {
            status: 409,
          });
        }

        serverLogger.error(error, "Failed to update event");
        return eventApiError(ctx, "event_update_failed", {
          status: 500,
        });
      }
    },
  )
  .get(
    "/:eventId/title",
    requirePermission({ eventCheckin: ["read"] }),
    sValidator("param", eventParamSchema, defaultValidationHandler),
    async (ctx) => {
      const { eventId } = ctx.req.valid("param");
      const event = await getEventRepository(ctx.env.EVENT_ENGINE_DB).findWithLimits(eventId);

      return event === null
        ? eventNotFound(ctx)
        : apiSuccess(ctx, {
            event: {
              id: event.id,
              title: event.title,
              slug: event.slug,
              defaultLocale: event.defaultLocale,
            },
          });
    },
  )
  .get(
    "/:eventId/activity",
    requirePermission({ eventActivity: ["read"] }),
    sValidator("param", eventParamSchema, defaultValidationHandler),
    async (ctx) => {
      const { eventId } = ctx.req.valid("param");
      const engineDb = ctx.env.EVENT_ENGINE_DB;

      const event = await getEventRepository(engineDb).findWithLimits(eventId);

      return event === null
        ? eventNotFound(ctx)
        : apiSuccess(ctx, {
            event,
            activity: await getAuditRepository(engineDb).listByEvent(eventId, LIMITS.list.activity),
          });
    },
  )
  .get(
    "/:eventId/overview",
    requirePermission({ event: ["read"] }),
    sValidator("param", eventParamSchema, defaultValidationHandler),
    async (ctx) => {
      const { eventId } = ctx.req.valid("param");
      const engineDb = ctx.env.EVENT_ENGINE_DB;
      const role = ctx.get("user").role;

      const [event, registrations, checkins, formVersions] = await Promise.all([
        getEventRepository(engineDb).findDetail(eventId),
        getRegistrationRepository(engineDb).listSummariesByEvent(
          eventId,
          LIMITS.list.overviewRegistrations,
        ),
        getCheckinRepository(engineDb).listByEvent(eventId, LIMITS.list.checkins),
        can(role, { eventForm: ["read"] })
          ? getFormVersionRepository(engineDb).listSummariesByEvent(eventId)
          : Promise.resolve([]),
      ]);

      if (event === null) {
        return eventNotFound(ctx);
      }

      return apiSuccess(ctx, { role, event, registrations, checkins, formVersions });
    },
  )
  .get(
    "/:eventId/form-versions",
    requirePermission({ eventForm: ["read"] }),
    sValidator("param", eventParamSchema, defaultValidationHandler),
    async (ctx) => {
      const { eventId } = ctx.req.valid("param");
      const engineDb = ctx.env.EVENT_ENGINE_DB;

      const event = await getEventRepository(engineDb).findDetail(eventId);
      if (event === null) {
        return eventNotFound(ctx);
      }

      const formVersions = await getFormVersionRepository(engineDb).listByEvent(eventId);

      return apiSuccess(ctx, {
        event,
        formVersions: formVersions.map(({ version, schema }) => ({ version, schema })),
      });
    },
  )
  .post(
    "/:eventId/form-versions",
    requirePermission({ eventForm: ["write"] }),
    sValidator("param", eventParamSchema, defaultValidationHandler),
    sValidator("json", formVersionCreateSchema, defaultValidationHandler),
    async (ctx) => {
      const { eventId } = ctx.req.valid("param");
      const body = ctx.req.valid("json");
      const engineDb = ctx.env.EVENT_ENGINE_DB;
      const event = await getEventRepository(engineDb).findDetail(eventId);

      if (event === null) {
        return eventNotFound(ctx);
      }

      const validation = validateFormSchema(body.schema, {
        mode: body.status === FORM_VERSION_STATUS.published ? "publish" : "draft",
        activeTicketTypeKeys: event.ticketTypes
          .filter((ticketType) => ticketType.active)
          .map((ticketType) => ticketType.key),
      });

      if (validation.errors.length > 0) {
        return eventApiError(ctx, "event_invalid_form_schema", {
          status: 400,
          fields: invalidFields(validation.errors.map((issue) => issue.path)),
          issues: validation.errors,
        });
      }

      try {
        const formVersion = await getFormVersionRepository(engineDb).create(
          eventId,
          body,
          ctx.get("user").id,
        );

        return apiSuccess(
          ctx,
          { formVersion },
          { status: 201, meta: { warnings: validation.warnings } },
        );
      } catch (error) {
        if (classifyDatabaseError(error).code === DATABASE_ERROR.uniqueConstraint) {
          return eventApiError(ctx, "event_form_version_exists", {
            status: 409,
          });
        }

        serverLogger.error(error, "Failed to create form version");
        return eventApiError(ctx, "event_form_version_create_failed", {
          status: 500,
        });
      }
    },
  )
  .get(
    "/:eventId/preview",
    requirePermission({ event: ["read"] }),
    sValidator("param", eventParamSchema, defaultValidationHandler),
    sValidator("query", previewQuerySchema, defaultValidationHandler),
    async (ctx) => {
      const { eventId } = ctx.req.valid("param");
      const engineDb = ctx.env.EVENT_ENGINE_DB;

      const event = await getEventRepository(engineDb).findDetail(eventId);
      if (event === null) {
        return eventNotFound(ctx);
      }

      const query = ctx.req.valid("query");
      const version = query.version ?? null;

      const formVersion =
        version === null
          ? await getFormVersionRepository(engineDb).findPublished(eventId)
          : await getFormVersionRepository(engineDb).findByVersion(eventId, version);

      if (formVersion === null) {
        return formNotFound(ctx);
      }

      const localeParam = query.locale;
      const locale =
        localeParam !== undefined && SUPPORTED_LOCALES.has(localeParam)
          ? localeParam
          : event.defaultLocale;

      const form = resolvePublishedForm(event, formVersion, locale);

      if (form === null) {
        return invalidFormSchema(ctx);
      }

      return apiSuccess(ctx, { form });
    },
  )
  .get(
    "/:eventId/support",
    requirePermission({ eventSupport: ["read"] }),
    sValidator("param", eventParamSchema, defaultValidationHandler),
    sValidator("query", supportQuerySchema, defaultValidationHandler),
    async (ctx) => {
      const { eventId } = ctx.req.valid("param");
      const engineDb = ctx.env.EVENT_ENGINE_DB;
      const event = await getEventRepository(engineDb).findDetail(eventId);

      if (event === null) {
        return eventNotFound(ctx);
      }

      const queryParams = ctx.req.valid("query");
      const query = (queryParams.q ?? "").trim().slice(0, LIMITS.search.query);
      const payment = queryParams.payment;
      const checkin = queryParams.checkin;

      if (queryParams.before !== undefined && queryParams.after !== undefined) {
        return invalidPayload(ctx, ["before", "after"]);
      }

      const before = registrationCursor.decode(queryParams.before);
      const after = registrationCursor.decode(queryParams.after);

      if (queryParams.before !== undefined && before === null) {
        return invalidPayload(ctx, ["before"]);
      }
      if (queryParams.after !== undefined && after === null) {
        return invalidPayload(ctx, ["after"]);
      }

      const result = await getRegistrationRepository(engineDb).searchByEvent(eventId, {
        query,
        payment,
        checkin,
        limit: LIMITS.list.supportPage,
        before: before ?? undefined,
        after: after ?? undefined,
      });
      const registrationIds = result.registrations.map((registration) => registration.id);
      const [payments, checkins] = await Promise.all([
        getPaymentRepository(engineDb).findByRegistrationIds(registrationIds),
        getCheckinRepository(engineDb).findByRegistrationIds(eventId, registrationIds),
      ]);

      return apiSuccess(
        ctx,
        {
          event,
          registrations: result.registrations,
          payments,
          checkins,
          filters: { query, payment: payment ?? null, checkin: checkin ?? null },
        },
        {
          meta: {
            keyset: {
              pageSize: LIMITS.list.supportPage,
              hasNext: result.hasNext,
              hasPrev: result.hasPrev,
              nextCursor:
                result.nextCursor === null ? null : registrationCursor.encode(result.nextCursor),
              prevCursor:
                result.prevCursor === null ? null : registrationCursor.encode(result.prevCursor),
            },
          },
        },
      );
    },
  )
  .post(
    "/:eventId/registrations/:registrationId/checkin",
    requirePermission({ eventCheckin: ["write"] }),
    sValidator("param", eventAndRegistrationParamSchema, defaultValidationHandler),
    async (ctx) => {
      const { eventId, registrationId } = ctx.req.valid("param");
      const engineDb = ctx.env.EVENT_ENGINE_DB;

      const [eventExists, registration, payment] = await Promise.all([
        getEventRepository(engineDb).existsById(eventId),
        getRegistrationRepository(engineDb).findById(eventId, registrationId),
        getPaymentRepository(engineDb).findByRegistrationId(registrationId),
      ]);

      if (!eventExists) {
        return eventNotFound(ctx);
      }
      if (registration === null) {
        return registrationNotFound(ctx);
      }
      if (!isRegistrationPaid(payment, registrationAmountDue(registration))) {
        return eventApiError(ctx, "event_payment_required", {
          status: 402,
        });
      }

      const result = await getCheckinRepository(engineDb).create(eventId, registrationId);

      if (result === null) {
        return eventApiError(ctx, "event_checkin_failed", {
          status: 500,
        });
      }

      return result.created
        ? apiSuccess(
            ctx,
            { registration, checkin: result.checkin, alreadyCheckedIn: false },
            { status: 201 },
          )
        : apiSuccess(ctx, { registration, checkin: result.checkin, alreadyCheckedIn: true });
    },
  )
  .delete(
    "/:eventId/registrations/:registrationId/checkin",
    requirePermission({ eventCheckin: ["write"] }),
    sValidator("param", eventAndRegistrationParamSchema, defaultValidationHandler),
    async (ctx) => {
      const { eventId, registrationId } = ctx.req.valid("param");

      const removed = await getCheckinRepository(ctx.env.EVENT_ENGINE_DB).remove(
        eventId,
        registrationId,
      );

      return removed
        ? apiSuccess(ctx, { removed: true })
        : eventApiError(ctx, "event_checkin_not_found", {
            status: 404,
          });
    },
  )
  .post(
    "/:eventId/registrations/:registrationId/payment",
    requirePermission({ eventPayment: ["write"] }),
    sValidator("param", eventAndRegistrationParamSchema, defaultValidationHandler),
    sValidator("json", paymentSchema, defaultValidationHandler),
    async (ctx) => {
      const { eventId, registrationId } = ctx.req.valid("param");
      const body = ctx.req.valid("json");
      const user = ctx.get("user");

      const engineDb = ctx.env.EVENT_ENGINE_DB;
      const [event, registration] = await Promise.all([
        getEventRepository(engineDb).findWithLimits(eventId),
        getRegistrationRepository(engineDb).findById(eventId, registrationId),
      ]);

      if (event === null) {
        return eventNotFound(ctx);
      }
      if (registration === null) {
        return registrationNotFound(ctx);
      }

      const amountDue = registrationAmountDue(registration);
      const currency = registration.tickets[0]?.currency ?? event.limits.currency;

      const result = await getPaymentRepository(engineDb).upsert({
        eventId,
        registrationId,
        amountMinor: amountDue,
        currency,
        method: body.method,
        confirmedBy: user.id,
        note: body.note ?? null,
      });

      if (result === null) {
        return eventApiError(ctx, "event_payment_update_failed", {
          status: 500,
        });
      }

      const { payment, created } = result;
      let emailQueued = false;

      if (created && isRegistrationPaid(payment, amountDue)) {
        const token = await issueStatusToken(
          getRegistrationStatusRepository(engineDb),
          registrationId,
        );
        const statusUrl = statusPageUrl(
          new URL(ctx.req.url).origin,
          event.defaultLocale,
          token.token,
        );

        emailQueued = await enqueuePaymentConfirmedEmail(ctx.env, {
          eventId,
          registrationId,
          paymentId: payment.id,
          statusUrl,
        });
      }

      return apiSuccess(ctx, { payment, emailQueued, created });
    },
  )
  .delete(
    "/:eventId/registrations/:registrationId/payment",
    requirePermission({ eventPayment: ["write"] }),
    sValidator("param", eventAndRegistrationParamSchema, defaultValidationHandler),
    async (ctx) => {
      const { eventId, registrationId } = ctx.req.valid("param");

      const user = ctx.get("user");

      const removed = await getPaymentRepository(ctx.env.EVENT_ENGINE_DB).remove(
        eventId,
        registrationId,
        user.id,
      );

      return removed
        ? apiSuccess(ctx, { removed: true })
        : eventApiError(ctx, "event_payment_not_found", {
            status: 404,
          });
    },
  )
  .get(
    "/:eventId/registrations",
    requirePermission({ eventRegistration: ["read"] }),
    sValidator("param", eventParamSchema, defaultValidationHandler),
    sValidator("query", registrationListQuerySchema, defaultValidationHandler),
    async (ctx) => {
      const { eventId } = ctx.req.valid("param");
      const limit = ctx.req.valid("query").limit ?? 50;
      const engineDb = ctx.env.EVENT_ENGINE_DB;

      if (!(await getEventRepository(engineDb).existsById(eventId))) {
        return eventNotFound(ctx);
      }

      return apiSuccess(ctx, {
        registrations: await getRegistrationRepository(engineDb).listByEvent(eventId, limit),
      });
    },
  )
  .post(
    "/:eventId/registrations",
    requirePermission({ eventRegistration: ["create"] }),
    sValidator("param", eventParamSchema, defaultValidationHandler),
    sValidator("json", registrationSchema, defaultValidationHandler),
    async (ctx) => {
      const { eventId } = ctx.req.valid("param");
      const body = ctx.req.valid("json");
      const engineDb = ctx.env.EVENT_ENGINE_DB;
      const event = await getEventRepository(engineDb).findDetail(eventId);

      if (event === null) {
        return eventNotFound(ctx);
      }

      let registration;

      try {
        registration = await createRegistration({
          registrations: getRegistrationRepository(engineDb),
          event,
          registration: body,
          enforceRegistrationOpen: false,
        });
      } catch (error) {
        if (error instanceof RegistrationFailureError) {
          return registrationFailureResponse(ctx, error);
        }

        throw error;
      }

      return registrationCreatedResponse(ctx, {
        env: ctx.env,
        eventId: event.id,
        locale: event.defaultLocale,
        registration,
      });
    },
  )
  .post(
    "/:eventId/registrations/manual",
    requirePermission({ eventRegistration: ["manual"] }),
    sValidator("param", eventParamSchema, defaultValidationHandler),
    sValidator("json", manualRegistrationSchema, defaultValidationHandler),
    async (ctx) => {
      const { eventId } = ctx.req.valid("param");
      const body = ctx.req.valid("json");
      const engineDb = ctx.env.EVENT_ENGINE_DB;
      const event = await getEventRepository(engineDb).findDetail(eventId);

      if (event === null) {
        return eventNotFound(ctx);
      }

      let registration;

      try {
        registration = await createManualRegistration({
          registrations: getRegistrationRepository(engineDb),
          event,
          registration: body,
        });
      } catch (error) {
        if (error instanceof RegistrationFailureError) {
          return registrationFailureResponse(ctx, error);
        }

        throw error;
      }

      return registrationCreatedResponse(ctx, {
        env: ctx.env,
        eventId: event.id,
        locale: event.defaultLocale,
        registration,
      });
    },
  )
  .get(
    "/:eventId/registrations/:registrationId",
    requirePermission({ eventRegistration: ["read"] }),
    sValidator("param", eventAndRegistrationParamSchema, defaultValidationHandler),
    async (ctx) => {
      const { eventId, registrationId } = ctx.req.valid("param");
      const lookup = await loadRegistrationView({
        db: ctx.env.EVENT_ENGINE_DB,
        eventId,
        registrationId,
      });

      if (!lookup.ok) {
        return lookup.reason === "event_not_found" ? eventNotFound(ctx) : registrationNotFound(ctx);
      }

      const { event, registration, payment, checkin, answerFields, amountDue, currency, paid } =
        lookup.view;

      return apiSuccess(ctx, {
        event,
        registration,
        payment,
        checkin,
        answerFields,
        amountDue,
        currency,
        paid,
      });
    },
  )
  .get(
    "/:eventId/registrations/:registrationId/qr",
    requirePermission({ eventQr: ["read"] }),
    sValidator("param", eventAndRegistrationParamSchema, defaultValidationHandler),
    async (ctx) => {
      const { eventId, registrationId } = ctx.req.valid("param");
      const lookup = await loadRegistrationView({
        db: ctx.env.EVENT_ENGINE_DB,
        eventId,
        registrationId,
        details: false,
      });

      if (!lookup.ok) {
        return lookup.reason === "event_not_found" ? eventNotFound(ctx) : registrationNotFound(ctx);
      }

      const { event, registration, payment, due, paid } = lookup.view;

      return apiSuccess(ctx, {
        event,
        registration,
        payment,
        due,
        qrAvailable: paid,
        qrSvg: paid ? createCheckinQrSvg(registrationId) : null,
      });
    },
  )
  .get(
    "/:eventId/ticket-types",
    requirePermission({ eventTicket: ["read"] }),
    sValidator("param", eventParamSchema, defaultValidationHandler),
    async (ctx) => {
      const { eventId } = ctx.req.valid("param");
      const engineDb = ctx.env.EVENT_ENGINE_DB;

      if (!(await getEventRepository(engineDb).existsById(eventId))) {
        return eventNotFound(ctx);
      }

      return apiSuccess(ctx, {
        ticketTypes: await getTicketTypeRepository(engineDb).listByEvent(eventId),
      });
    },
  )
  .post(
    "/:eventId/ticket-types",
    requirePermission({ eventTicket: ["write"] }),
    sValidator("param", eventParamSchema, defaultValidationHandler),
    sValidator("json", ticketTypeSchema, defaultValidationHandler),
    async (ctx) => {
      const { eventId } = ctx.req.valid("param");
      const ticketType = ctx.req.valid("json");
      const fields = validateTicketTypes([ticketType]);

      if (fields.length > 0) {
        return invalidPayload(ctx, fields);
      }

      const engineDb = ctx.env.EVENT_ENGINE_DB;

      const [eventExists, existing] = await Promise.all([
        getEventRepository(engineDb).existsById(eventId),
        getTicketTypeRepository(engineDb).findByKey(eventId, ticketType.key),
      ]);

      if (!eventExists) {
        return eventNotFound(ctx);
      }

      if (existing !== null) {
        return eventApiError(ctx, "event_ticket_type_exists", {
          status: 409,
        });
      }

      try {
        return apiSuccess(
          ctx,
          { ticketType: await getTicketTypeRepository(engineDb).create(eventId, ticketType) },
          { status: 201 },
        );
      } catch (error) {
        serverLogger.error(error, "Failed to create ticket type");
        return eventApiError(ctx, "event_ticket_type_create_failed", {
          status: 500,
        });
      }
    },
  )
  .patch(
    "/:eventId/ticket-types/:key",
    requirePermission({ eventTicket: ["write"] }),
    sValidator("param", eventAndTicketKeyParamSchema, defaultValidationHandler),
    sValidator("json", ticketTypeUpdateSchema, defaultValidationHandler),
    async (ctx) => {
      const { eventId, key } = ctx.req.valid("param");
      const body = ctx.req.valid("json");
      const engineDb = ctx.env.EVENT_ENGINE_DB;

      const [eventExists, current] = await Promise.all([
        getEventRepository(engineDb).existsById(eventId),
        getTicketTypeRepository(engineDb).findByKey(eventId, key),
      ]);

      if (!eventExists) {
        return eventNotFound(ctx);
      }

      if (current === null) {
        return eventApiError(ctx, "event_ticket_type_not_found", {
          status: 404,
        });
      }

      const input = mergeTicketType(current, body);

      if (input.capacity !== null && current.ticketsSold > input.capacity) {
        return invalidPayload(ctx, ["capacity"]);
      }

      if (input.active && !current.active) {
        const publishedForm = await getFormVersionRepository(engineDb).findPublished(eventId);

        if (publishedForm !== null && !placesTicketType(publishedForm.schema, key)) {
          return eventApiError(ctx, "event_form_update_required", {
            status: 409,
            fields: ["active"],
          });
        }
      }

      const fields = validateTicketTypes([input]);

      if (fields.length > 0) {
        return invalidPayload(ctx, fields);
      }

      try {
        return apiSuccess(ctx, {
          ticketType: await getTicketTypeRepository(engineDb).update(eventId, key, input),
        });
      } catch (error) {
        serverLogger.error(error, "Failed to update ticket type");
        return eventApiError(ctx, "event_ticket_type_update_failed", {
          status: 500,
        });
      }
    },
  );
