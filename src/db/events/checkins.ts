/* oxlint-disable unicorn/max-nested-calls -- Drizzle query builders are nested by design. */
import { and, count, desc, eq, exists, inArray } from "drizzle-orm";

import type { CheckinListItem, CheckinRecord } from "~/events/domain/types";
import { chunk } from "~/shared/utils/chunk";
import { newId } from "~/shared/utils/uuid";

import type { EngineOrm } from "./orm";
import { checkins, registrations } from "./schema";

export interface CheckinRepository {
  listByEvent: (eventId: string, limit: number) => Promise<CheckinListItem[]>;
  countByEvent: (eventId: string) => Promise<number>;
  findByRegistration: (eventId: string, registrationId: string) => Promise<CheckinRecord | null>;
  findByRegistrationIds: (
    eventId: string,
    registrationIds: readonly string[],
  ) => Promise<CheckinRecord[]>;
  create: (eventId: string, registrationId: string) => Promise<CheckinRecord | null>;
  remove: (eventId: string, registrationId: string) => Promise<boolean>;
}

export function createCheckinRepository(orm: EngineOrm): CheckinRepository {
  // oxlint-disable-next-line typescript/explicit-function-return-type -- Drizzle select builder type is inferred.
  const selectRows = () =>
    orm
      .select({
        id: checkins.id,
        registrationId: checkins.registrationId,
        checkedInAt: checkins.checkedInAt,
        eventId: registrations.eventId,
        fullName: registrations.fullName,
      })
      .from(checkins)
      .innerJoin(registrations, eq(registrations.id, checkins.registrationId));

  async function findByRegistration(
    eventId: string,
    registrationId: string,
  ): Promise<CheckinRecord | null> {
    const row = await selectRows()
      .where(and(eq(registrations.eventId, eventId), eq(checkins.registrationId, registrationId)))
      .get();

    return row === undefined
      ? null
      : {
          id: row.id,
          eventId: row.eventId,
          registrationId: row.registrationId,
          checkedInAt: row.checkedInAt,
        };
  }

  return {
    async listByEvent(eventId, limit) {
      const rows = await selectRows()
        .where(eq(registrations.eventId, eventId))
        .orderBy(desc(checkins.checkedInAt))
        .limit(limit)
        .all();

      return rows.map((row) => ({
        id: row.id,
        eventId: row.eventId,
        registrationId: row.registrationId,
        checkedInAt: row.checkedInAt,
        fullName: row.fullName ?? "",
      }));
    },

    async countByEvent(eventId) {
      const row = await orm
        .select({ total: count() })
        .from(checkins)
        .innerJoin(registrations, eq(registrations.id, checkins.registrationId))
        .where(eq(registrations.eventId, eventId))
        .get();

      return row?.total ?? 0;
    },

    findByRegistration,

    async findByRegistrationIds(eventId, registrationIds) {
      const ids = [...new Set(registrationIds)];
      const results = await Promise.all(
        chunk(ids, 90).map(async (group) => {
          const rows = await selectRows()
            .where(and(eq(registrations.eventId, eventId), inArray(checkins.registrationId, group)))
            .all();

          return rows.map((row) => ({
            id: row.id,
            eventId: row.eventId,
            registrationId: row.registrationId,
            checkedInAt: row.checkedInAt,
          }));
        }),
      );

      return results.flat();
    },

    async create(eventId, registrationId) {
      const registration = await orm
        .select({ id: registrations.id })
        .from(registrations)
        .where(and(eq(registrations.id, registrationId), eq(registrations.eventId, eventId)))
        .get();

      if (registration === undefined) {
        return null;
      }

      const row = await orm
        .insert(checkins)
        .values({ id: newId(), registrationId })
        .onConflictDoNothing()
        .returning({
          id: checkins.id,
          registrationId: checkins.registrationId,
          checkedInAt: checkins.checkedInAt,
        })
        .get();

      if (row !== undefined) {
        return {
          id: row.id,
          eventId,
          registrationId: row.registrationId,
          checkedInAt: row.checkedInAt,
        };
      }

      return findByRegistration(eventId, registrationId);
    },

    async remove(eventId, registrationId) {
      const removed = await orm
        .delete(checkins)
        .where(
          and(
            eq(checkins.registrationId, registrationId),
            exists(
              orm
                .select({ id: registrations.id })
                .from(registrations)
                .where(
                  and(eq(registrations.id, registrationId), eq(registrations.eventId, eventId)),
                ),
            ),
          ),
        )
        .returning({ id: checkins.id });

      return removed.length > 0;
    },
  };
}
