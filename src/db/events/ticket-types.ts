import { and, asc, eq } from "drizzle-orm";

import type { TicketTypeInput, TicketTypeRecord } from "~/events/domain/types";

import type { EngineOrm } from "./orm";
import { eventTicketTypes, ticketTypeStats } from "./schema";

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

function toTicketType(
  row: typeof eventTicketTypes.$inferSelect & { ticketsSold: number | null },
): TicketTypeRecord {
  return toTicketTypeRecord(row, row.ticketsSold);
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
  listByEvent: (eventId: string, options?: { activeOnly?: boolean }) => Promise<TicketTypeRecord[]>;
  findByKey: (eventId: string, key: string) => Promise<TicketTypeRecord | null>;
  create: (eventId: string, input: TicketTypeInput) => Promise<TicketTypeRecord>;
  update: (
    eventId: string,
    key: string,
    input: Partial<Omit<TicketTypeInput, "key">>,
  ) => Promise<TicketTypeRecord | null>;
}

export function createTicketTypeRepository(orm: EngineOrm): TicketTypeRepository {
  // oxlint-disable-next-line typescript/explicit-function-return-type -- Drizzle select builder type is inferred.
  const selectRows = () =>
    orm
      .select({
        eventId: eventTicketTypes.eventId,
        key: eventTicketTypes.key,
        labelJson: eventTicketTypes.labelJson,
        descriptionJson: eventTicketTypes.descriptionJson,
        priceMinor: eventTicketTypes.priceMinor,
        minPerRegistration: eventTicketTypes.minPerRegistration,
        maxPerRegistration: eventTicketTypes.maxPerRegistration,
        defaultQuantity: eventTicketTypes.defaultQuantity,
        capacity: eventTicketTypes.capacity,
        active: eventTicketTypes.active,
        sortOrder: eventTicketTypes.sortOrder,
        createdAt: eventTicketTypes.createdAt,
        updatedAt: eventTicketTypes.updatedAt,
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

  async function findByKey(eventId: string, key: string): Promise<TicketTypeRecord | null> {
    const row = await selectRows()
      .where(and(eq(eventTicketTypes.eventId, eventId), eq(eventTicketTypes.key, key)))
      .get();

    return row === undefined ? null : toTicketType(row);
  }

  return {
    async listByEvent(eventId, options = {}) {
      const rows = await selectRows()
        .where(
          options.activeOnly === true
            ? and(eq(eventTicketTypes.eventId, eventId), eq(eventTicketTypes.active, true))
            : eq(eventTicketTypes.eventId, eventId),
        )
        .orderBy(asc(eventTicketTypes.sortOrder), asc(eventTicketTypes.key))
        .all();

      return rows.map((row) => toTicketType(row));
    },

    findByKey,

    async create(eventId, input) {
      await orm.insert(eventTicketTypes).values(ticketTypeInsertValues(eventId, input));

      const created = await findByKey(eventId, input.key);

      if (created === null) {
        throw new Error("ticket_type_insert_failed");
      }

      return created;
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

      changes.updatedAt = new Date().toISOString();

      await orm
        .update(eventTicketTypes)
        .set(changes)
        .where(and(eq(eventTicketTypes.eventId, eventId), eq(eventTicketTypes.key, key)));

      return findByKey(eventId, key);
    },
  };
}
