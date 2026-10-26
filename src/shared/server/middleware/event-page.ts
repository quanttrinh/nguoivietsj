import { env } from "cloudflare:workers";

import type { UserIdentity } from "~/db/app/users";
import { createEngineDb, type EngineDb } from "~/db/events";
import type { EventDetail, EventWithLimits } from "~/events/domain/types";
import { SUPPORTED_LOCALES } from "~/shared/constants/locales";
import { USER_ROLE, type UserRole } from "~/shared/constants/roles";
import { eventIdFromParams } from "~/shared/server/api/params";

import { requireAdminPage, requireStaffPage } from "./page-guard";

interface EventPageContext {
  params: Record<string, string | undefined>;
  request: Request;
  locals: App.Locals;
  response: {
    headers: Headers;
  };
}

export type EventPageRole = UserRole;

export interface LoadedEventSummaryPage {
  auth: UserIdentity;
  locale: string;
  id: string;
  event: EventWithLimits;
  db: EngineDb;
}

export interface LoadedEventDetailPage extends Omit<LoadedEventSummaryPage, "event"> {
  event: EventDetail;
}

function notFound(): Response {
  return new Response("Not found", { status: 404 });
}

async function loadEventPage(
  context: EventPageContext,
  role: EventPageRole,
  detail: boolean,
): Promise<LoadedEventSummaryPage | LoadedEventDetailPage | Response> {
  const auth =
    role === USER_ROLE.admin ? await requireAdminPage(context) : await requireStaffPage(context);

  if (auth instanceof Response) {
    return auth;
  }

  const locale = context.params.locale;

  if (locale === undefined || !SUPPORTED_LOCALES.has(locale)) {
    return notFound();
  }

  const id = eventIdFromParams(context.params);

  if (id === null) {
    return notFound();
  }

  const db = createEngineDb(env.EVENT_ENGINE_DB);
  const event = detail ? await db.events.findDetail(id) : await db.events.findWithLimits(id);

  if (event === null) {
    return notFound();
  }

  return { auth, locale, id, event, db };
}

/** Load an admin event page with limits but without ticket types. */
export function loadAdminEventSummary(
  context: EventPageContext,
  role: EventPageRole,
): Promise<LoadedEventSummaryPage | Response> {
  return loadEventPage(context, role, false);
}

/** Load an admin event page with ticket types. */
export function loadAdminEventDetail(
  context: EventPageContext,
  role: EventPageRole,
): Promise<LoadedEventDetailPage | Response> {
  return loadEventPage(context, role, true) as Promise<LoadedEventDetailPage | Response>;
}
