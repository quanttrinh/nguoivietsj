// @boundary server
import { desc, eq } from "drizzle-orm";

import { newId } from "~/shared/utils/uuid";

import { databaseSingleton, type EngineOrm } from "./orm";
import { auditEvents } from "./schemas";

export interface AuditEventInput {
  eventId: string;
  actorUserId: string;
  action: string;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AuditEventRecord {
  id: string;
  eventId: string;
  actorUserId: string;
  action: string;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditRepository {
  listByEvent: (eventId: string, limit: number) => Promise<AuditEventRecord[]>;
}

/** Build an audit-row insert for use inside a D1 batch. */
// oxlint-disable-next-line typescript/explicit-function-return-type, typescript/explicit-module-boundary-types -- Drizzle insert type is inferred.
export function auditEventInsert(orm: EngineOrm, input: AuditEventInput) {
  return orm.insert(auditEvents).values({
    id: newId(),
    eventId: input.eventId,
    actorUserId: input.actorUserId,
    action: input.action,
    targetId: input.targetId ?? null,
    metadata: input.metadata ?? null,
  });
}

function createAuditRepository(orm: EngineOrm): AuditRepository {
  return {
    listByEvent(eventId, limit) {
      return orm
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.eventId, eventId))
        .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
        .limit(limit)
        .all();
    },
  };
}

export const getAuditRepository = databaseSingleton(createAuditRepository);
