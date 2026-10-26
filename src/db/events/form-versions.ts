/* oxlint-disable unicorn/max-nested-calls -- Drizzle query builders are nested by design. */
import { and, desc, eq } from "drizzle-orm";

import { FORM_VERSION_STATUS } from "~/events/domain/constants";
import type { FormVersionInput, FormVersionRecord } from "~/events/domain/types";

import type { EngineOrm } from "./orm";
import { eventFormVersions } from "./schema";

export function toFormVersion(row: typeof eventFormVersions.$inferSelect): FormVersionRecord {
  return {
    eventId: row.eventId,
    version: row.version,
    schema: row.schemaJson,
    status: row.status,
    createdAt: row.createdAt,
    publishedAt: row.publishedAt,
  };
}

export interface FormVersionRepository {
  listByEvent: (eventId: string) => Promise<FormVersionRecord[]>;
  findPublished: (eventId: string) => Promise<FormVersionRecord | null>;
  findByVersion: (eventId: string, version: number) => Promise<FormVersionRecord | null>;
  create: (
    eventId: string,
    input: FormVersionInput,
    createdBy: string | null,
  ) => Promise<FormVersionRecord>;
}

export function createFormVersionRepository(orm: EngineOrm): FormVersionRepository {
  return {
    async listByEvent(eventId) {
      const rows = await orm
        .select()
        .from(eventFormVersions)
        .where(eq(eventFormVersions.eventId, eventId))
        .orderBy(desc(eventFormVersions.version))
        .all();

      return rows.map((row) => toFormVersion(row));
    },

    async findPublished(eventId) {
      const row = await orm
        .select()
        .from(eventFormVersions)
        .where(
          and(
            eq(eventFormVersions.eventId, eventId),
            eq(eventFormVersions.status, FORM_VERSION_STATUS.published),
          ),
        )
        .get();

      return row === undefined ? null : toFormVersion(row);
    },

    async findByVersion(eventId, version) {
      const row = await orm
        .select()
        .from(eventFormVersions)
        .where(and(eq(eventFormVersions.eventId, eventId), eq(eventFormVersions.version, version)))
        .get();

      return row === undefined ? null : toFormVersion(row);
    },

    async create(eventId, input, createdBy) {
      const publishedAt =
        input.status === FORM_VERSION_STATUS.published ? new Date().toISOString() : null;
      const insert = orm.insert(eventFormVersions).values({
        eventId,
        version: input.version,
        schemaJson: input.schema,
        status: input.status,
        createdBy,
        publishedAt,
      });

      await (input.status === FORM_VERSION_STATUS.published
        ? orm.batch([
            orm
              .update(eventFormVersions)
              .set({ status: FORM_VERSION_STATUS.archived })
              .where(
                and(
                  eq(eventFormVersions.eventId, eventId),
                  eq(eventFormVersions.status, FORM_VERSION_STATUS.published),
                ),
              ),
            insert,
          ])
        : orm.batch([insert]));

      const row = await orm
        .select()
        .from(eventFormVersions)
        .where(
          and(eq(eventFormVersions.eventId, eventId), eq(eventFormVersions.version, input.version)),
        )
        .get();

      if (row === undefined) {
        throw new Error("form_version_insert_failed");
      }

      return toFormVersion(row);
    },
  };
}
