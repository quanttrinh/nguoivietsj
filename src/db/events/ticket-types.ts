// @boundary server
import { and, asc, eq, getTableColumns, type SQL } from "drizzle-orm";

import type { TicketTypeInput, TicketTypeRecord } from "~/events/domain/types";

import { databaseSingleton, type EngineOrm } from "./orm";
import { eventTicketTypes, ticketTypeStats } from "./schemas";

export function toTicketTypeRecord(
  row: typeof eventTicketTypes.$inferSelect,
  ticketsSold: number | null,
): TicketTypeRecord {
  return {
    eventId: row.eventId,
    key: row.key,
    label: row.labelJson,
    description: row.descriptionJson,
    priceMinor: row.priceMinor,
    minPerRegistration: row.minPerRegistration,
    maxPerRegistration: row.maxPerRegistration,
    defaultQuantity: row.defaultQuantity,
    capacity: row.capacity,
    active: row.active,
    sortOrder: row.sortOrder,
    ticketsSold: ticketsSold ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function ticketTypeInsertValues(
  eventId: string,
  input: TicketTypeInput,
): typeof eventTicketTypes.$inferInsert {
  return {
    eventId,
    key: input.key,
    labelJson: input.label,
    descriptionJson: input.description,
    priceMinor: input.priceMinor,
    minPerRegistration: input.minPerRegistration,
    maxPerRegistration: input.maxPerRegistration,
    defaultQuantity: input.defaultQuantity,
    capacity: input.capacity,
    active: input.active,
    sortOrder: input.sortOrder,
  };
}

export interface TicketTypeRepository {
  listByEvent: (eventId: string) => Promise<TicketTypeRecord[]>;
  findByKey: (eventId: string, key: string) => Promise<TicketTypeRecord | null>;
  create: (eventId: string, input: TicketTypeInput) => Promise<TicketTypeRecord>;
  update: (
    eventId: string,
    key: string,
    input: Partial<Omit<TicketTypeInput, "key">>,
  ) => Promise<TicketTypeRecord | null>;
}

function ticketTypeKeyWhere(eventId: string, key: string): SQL | undefined {
  return and(eq(eventTicketTypes.eventId, eventId), eq(eventTicketTypes.key, key));
}

function createTicketTypeRepository(orm: EngineOrm): TicketTypeRepository {
  const selectRows = () =>
    orm
      .select({
        ...getTableColumns(eventTicketTypes),
        ticketsSold: ticketTypeStats.ticketsSold,
      })
      .from(eventTicketTypes)
      .leftJoin(
        ticketTypeStats,
        and(
          eq(ticketTypeStats.eventId, eventTicketTypes.eventId),
          eq(ticketTypeStats.ticketTypeKey, eventTicketTypes.key),
        ),
      );

  function findByKeyQuery(eventId: string, key: string) {
    return selectRows().where(ticketTypeKeyWhere(eventId, key)).limit(1);
  }

  async function findByKey(eventId: string, key: string): Promise<TicketTypeRecord | null> {
    const row = await findByKeyQuery(eventId, key).get();

    return row === undefined ? null : toTicketTypeRecord(row, row.ticketsSold);
  }

  return {
    async listByEvent(eventId) {
      const rows = await selectRows()
        .where(eq(eventTicketTypes.eventId, eventId))
        .orderBy(asc(eventTicketTypes.sortOrder), asc(eventTicketTypes.key))
        .all();

      return rows.map((row) => toTicketTypeRecord(row, row.ticketsSold));
    },

    findByKey,

    async create(eventId, input) {
      const [, rows] = await orm.batch([
        orm.insert(eventTicketTypes).values(ticketTypeInsertValues(eventId, input)),
        findByKeyQuery(eventId, input.key),
      ]);
      const row = rows[0];

      if (row === undefined) {
        throw new Error("ticket_type_insert_failed");
      }

      return toTicketTypeRecord(row, row.ticketsSold);
    },

    async update(eventId, key, input) {
      const changes: Partial<typeof eventTicketTypes.$inferInsert> = {};

      if (input.label !== undefined) {
        changes.labelJson = input.label;
      }
      if (input.description !== undefined) {
        changes.descriptionJson = input.description;
      }
      if (input.priceMinor !== undefined) {
        changes.priceMinor = input.priceMinor;
      }
      if (input.minPerRegistration !== undefined) {
        changes.minPerRegistration = input.minPerRegistration;
      }
      if (input.maxPerRegistration !== undefined) {
        changes.maxPerRegistration = input.maxPerRegistration;
      }
      if (input.defaultQuantity !== undefined) {
        changes.defaultQuantity = input.defaultQuantity;
      }
      if (input.capacity !== undefined) {
        changes.capacity = input.capacity;
      }
      if (input.active !== undefined) {
        changes.active = input.active;
      }
      if (input.sortOrder !== undefined) {
        changes.sortOrder = input.sortOrder;
      }

      if (Object.keys(changes).length === 0) {
        return findByKey(eventId, key);
      }

      const [, rows] = await orm.batch([
        orm.update(eventTicketTypes).set(changes).where(ticketTypeKeyWhere(eventId, key)),
        findByKeyQuery(eventId, key),
      ]);
      const row = rows[0];

      return row === undefined ? null : toTicketTypeRecord(row, row.ticketsSold);
    },
  };
}

export const getTicketTypeRepository = databaseSingleton(createTicketTypeRepository);
