// @boundary server
import { and, desc, eq, inArray } from "drizzle-orm";

import type { CheckinListItem, CheckinRecord } from "~/events/domain/types";
import { chunk } from "~/shared/utils/chunk";
import { newId } from "~/shared/utils/uuid";

import { classifyDatabaseError, DATABASE_ERROR } from "./errors";
import { databaseSingleton, type EngineOrm } from "./orm";
import { checkins, registrations } from "./schemas";

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

function createCheckinRepository(orm: EngineOrm): CheckinRepository {
  // oxlint-disable-next-line typescript/explicit-function-return-type -- Drizzle select builder type is inferred.
  const selectRows = () => orm.select().from(checkins);

  async function findByRegistration(
    eventId: string,
    registrationId: string,
  ): Promise<CheckinRecord | null> {
    const row = await selectRows()
      .where(and(eq(checkins.eventId, eventId), eq(checkins.registrationId, registrationId)))
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
      const rows = await orm
        .select({
          id: checkins.id,
          eventId: checkins.eventId,
          registrationId: checkins.registrationId,
          checkedInAt: checkins.checkedInAt,
          fullName: registrations.fullName,
        })
        .from(checkins)
        .innerJoin(registrations, eq(registrations.id, checkins.registrationId))
        .where(eq(checkins.eventId, eventId))
        .orderBy(desc(checkins.checkedInAt))
        .limit(limit)
        .all();

      return rows;
    },

    countByEvent(eventId) {
      return orm.$count(checkins, eq(checkins.eventId, eventId));
    },

    findByRegistration,

    async findByRegistrationIds(eventId, registrationIds) {
      const ids = [...new Set(registrationIds)];

      if (ids.length === 0) {
        return [];
      }

      const queries = chunk(ids, 90).map((group) =>
        selectRows().where(
          and(eq(checkins.eventId, eventId), inArray(checkins.registrationId, group)),
        ),
      );
      const [first, ...rest] = queries;

      if (first === undefined) {
        return [];
      }

      const results = await orm.batch([first, ...rest]);

      return results.flat().map((row) => ({
        id: row.id,
        eventId: row.eventId,
        registrationId: row.registrationId,
        checkedInAt: row.checkedInAt,
      }));
    },

    async create(eventId, registrationId) {
      try {
        const row = await orm
          .insert(checkins)
          .values({ id: newId(), eventId, registrationId })
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
      } catch (error) {
        if (classifyDatabaseError(error).code === DATABASE_ERROR.foreignKey) {
          return null;
        }

        throw error;
      }

      return findByRegistration(eventId, registrationId);
    },

    async remove(eventId, registrationId) {
      const removed = await orm
        .delete(checkins)
        .where(and(eq(checkins.eventId, eventId), eq(checkins.registrationId, registrationId)))
        .returning({ id: checkins.id });

      return removed.length > 0;
    },
  };
}

export const getCheckinRepository = databaseSingleton(createCheckinRepository);
