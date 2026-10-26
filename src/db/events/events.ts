/* oxlint-disable unicorn/max-nested-calls, eslint/max-lines-per-function -- Drizzle query builders are nested by design and the catalog repository keeps related reads/writes together. */
import { and, asc, desc, eq, exists, gt, inArray, isNull, or, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { EVENT_STATUS } from "~/events/domain/constants";
import type {
  EventCreateInput,
  EventDetail,
  EventRecord,
  EventUpdateInput,
  EventTicketLimits,
  EventWithLimits,
  PublicEventSummary,
} from "~/events/domain/types";
import { newId } from "~/shared/utils/uuid";

import type { EngineOrm } from "./orm";
import {
  eventAliases,
  eventSlugClaims,
  eventTicketLimits,
  eventTicketTypes,
  events,
  type registrationStats,
} from "./schema";
import { ticketTypeInsertValues, toTicketTypeRecord } from "./ticket-types";

type EventRow = typeof events.$inferSelect;
type AliasRow = typeof eventAliases.$inferSelect;
type StatsRow = typeof registrationStats.$inferSelect;
type LimitsRow = typeof eventTicketLimits.$inferSelect;
type TicketTypeDetailRow = typeof eventTicketTypes.$inferSelect & {
  stats: { ticketsSold: number } | null;
};
type EventDetailRow = EventRow & {
  aliases: AliasRow[];
  stats: StatsRow | null;
  limits: LimitsRow | null;
  ticketTypes: TicketTypeDetailRow[];
};

function toEventRecord(row: {
  event: EventRow;
  aliases?: AliasRow[];
  stats?: StatsRow | null;
}): EventRecord {
  const event = row.event;

  return {
    id: event.id,
    slug: event.slug,
    eventType: event.eventType,
    editionYear: event.editionYear,
    defaultLocale: event.defaultLocale,
    aliases: (row.aliases ?? []).map((alias) => alias.alias).toSorted(),
    status: event.status,
    enabled: event.enabled,
    registrationOpen: event.registrationOpen,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    timezone: event.timezone,
    title: event.titleJson,
    summary: event.summaryJson,
    location: {
      name: event.locationName,
      address: event.locationAddress,
      mapUrl: event.locationMapUrl,
      mapEmbedUrl: event.locationMapEmbedUrl,
    },
    payments: {
      etransfer: {
        enabled: event.paymentEtransferEnabled,
        email: event.paymentEtransferEmail,
      },
      cash: {
        enabled: event.paymentCashEnabled,
        address: event.paymentCashAddress,
        mapUrl: event.paymentCashMapUrl,
        mapEmbedUrl: event.paymentCashMapEmbedUrl,
      },
    },
    notes: event.notesJson,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    registrationCount: row.stats?.registrationCount ?? 0,
    ticketsTotal: row.stats?.ticketsTotal ?? 0,
  };
}

function toLimits(row: LimitsRow | null | undefined): EventTicketLimits {
  return {
    currency: row?.currency ?? "CAD",
    maxTicketsPerRegistration: row?.maxTicketsPerRegistration ?? null,
    maxTotalTickets: row?.maxTotalTickets ?? null,
  };
}

function toEventWithLimits(row: {
  event: EventRow;
  aliases?: AliasRow[];
  stats?: StatsRow | null;
  limits?: LimitsRow | null;
}): EventWithLimits {
  return {
    ...toEventRecord(row),
    limits: toLimits(row.limits),
  };
}

function toEventDetail(row: EventDetailRow): EventDetail {
  return {
    ...toEventWithLimits({
      event: row,
      aliases: row.aliases,
      stats: row.stats,
      limits: row.limits,
    }),
    ticketTypes: row.ticketTypes.map((type) =>
      toTicketTypeRecord(type, type.stats?.ticketsSold ?? null),
    ),
  };
}

export interface EventRepository {
  list: () => Promise<EventRecord[]>;
  listPublicSummaries: (now: string) => Promise<PublicEventSummary[]>;
  findWithLimits: (id: string) => Promise<EventWithLimits | null>;
  existsById: (id: string) => Promise<boolean>;
  findPublicDetailBySlug: (slug: string, now: string) => Promise<EventDetail | null>;
  findDetail: (id: string) => Promise<EventDetail | null>;
  create: (input: EventCreateInput) => Promise<EventDetail>;
  update: (id: string, input: EventUpdateInput) => Promise<EventDetail | null>;
}

export function createEventRepository(orm: EngineOrm): EventRepository {
  async function findEvent(id: string): Promise<EventWithLimits | null> {
    const row = await orm.query.events.findFirst({
      where: eq(events.id, id),
      with: { aliases: true, stats: true, limits: true },
    });

    return row === undefined
      ? null
      : toEventWithLimits({
          event: row,
          aliases: row.aliases,
          stats: row.stats,
          limits: row.limits,
        });
  }

  async function findEventDetail(id: string): Promise<EventDetail | null> {
    const row = await orm.query.events.findFirst({
      where: eq(events.id, id),
      with: {
        aliases: true,
        stats: true,
        limits: true,
        ticketTypes: {
          with: { stats: true },
          orderBy: [asc(eventTicketTypes.sortOrder), asc(eventTicketTypes.key)],
        },
      },
    });

    return row === undefined ? null : toEventDetail(row);
  }

  return {
    async list() {
      const rows = await orm.query.events.findMany({
        with: { aliases: true, stats: true, limits: true },
        orderBy: [desc(events.createdAt), desc(events.id)],
      });

      return rows.map((row) =>
        toEventRecord({ event: row, aliases: row.aliases, stats: row.stats }),
      );
    },

    async listPublicSummaries(now) {
      const rows = await orm
        .select({
          id: events.id,
          slug: events.slug,
          defaultLocale: events.defaultLocale,
          status: events.status,
          registrationOpen: events.registrationOpen,
          startsAt: events.startsAt,
          endsAt: events.endsAt,
          timezone: events.timezone,
          title: events.titleJson,
          summary: events.summaryJson,
        })
        .from(events)
        .where(
          and(
            eq(events.enabled, true),
            inArray(events.status, [EVENT_STATUS.upcoming, EVENT_STATUS.active]),
            or(isNull(events.endsAt), gt(events.endsAt, now)),
          ),
        )
        .orderBy(
          // Events with a start time first, then chronological order.
          sql`${events.startsAt} IS NULL`,
          asc(events.startsAt),
          asc(events.id),
        )
        .all();

      return rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        defaultLocale: row.defaultLocale,
        status: row.status,
        registrationOpen: row.registrationOpen,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        timezone: row.timezone,
        title: row.title,
        summary: row.summary,
      }));
    },

    findWithLimits: findEvent,

    async existsById(id) {
      const row = await orm.select({ id: events.id }).from(events).where(eq(events.id, id)).get();
      return row !== undefined;
    },

    async findPublicDetailBySlug(slug, now) {
      // Resolve the slug claim inside the event query to avoid a separate round trip.
      const row = await orm.query.events.findFirst({
        where: and(
          exists(
            orm
              .select({ eventId: eventSlugClaims.eventId })
              .from(eventSlugClaims)
              .where(and(eq(eventSlugClaims.slug, slug), eq(eventSlugClaims.eventId, events.id))),
          ),
          eq(events.enabled, true),
          inArray(events.status, [EVENT_STATUS.upcoming, EVENT_STATUS.active]),
          or(isNull(events.endsAt), gt(events.endsAt, now)),
        ),
        with: {
          aliases: true,
          stats: true,
          limits: true,
          ticketTypes: {
            with: { stats: true },
            orderBy: [asc(eventTicketTypes.sortOrder), asc(eventTicketTypes.key)],
          },
        },
      });

      return row === undefined ? null : toEventDetail(row);
    },

    findDetail: findEventDetail,

    async create(input) {
      const id = newId();
      const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
        orm.insert(events).values({
          id,
          slug: input.slug,
          eventType: input.eventType,
          editionYear: input.editionYear,
          defaultLocale: input.defaultLocale,
          status: input.status,
          enabled: input.enabled,
          registrationOpen: input.registrationOpen,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          timezone: input.timezone,
          titleJson: input.title,
          summaryJson: input.summary,
          locationName: input.location.name,
          locationAddress: input.location.address,
          locationMapUrl: input.location.mapUrl,
          locationMapEmbedUrl: input.location.mapEmbedUrl,
          paymentEtransferEnabled: input.payments.etransfer.enabled,
          paymentEtransferEmail: input.payments.etransfer.email,
          paymentCashEnabled: input.payments.cash.enabled,
          paymentCashAddress: input.payments.cash.address,
          paymentCashMapUrl: input.payments.cash.mapUrl,
          paymentCashMapEmbedUrl: input.payments.cash.mapEmbedUrl,
          notesJson: input.notes,
        }),
        orm.insert(eventSlugClaims).values(
          [input.slug, ...input.aliases].map((slug) => ({
            slug,
            eventId: id,
          })),
        ),
        orm.insert(eventTicketLimits).values({
          eventId: id,
          currency: input.limits.currency,
          maxTicketsPerRegistration: input.limits.maxTicketsPerRegistration,
          maxTotalTickets: input.limits.maxTotalTickets,
        }),
        orm
          .insert(eventTicketTypes)
          .values(input.ticketTypes.map((type) => ticketTypeInsertValues(id, type))),
      ];

      if (input.aliases.length > 0) {
        statements.push(
          orm.insert(eventAliases).values(input.aliases.map((alias) => ({ alias, eventId: id }))),
        );
      }

      await orm.batch(statements);

      const detail = await findEventDetail(id);

      if (detail === null) {
        throw new Error("event_insert_failed");
      }

      return detail;
    },

    async update(id, input) {
      const current = await orm
        .select({ slug: events.slug })
        .from(events)
        .where(eq(events.id, id))
        .get();

      if (current === undefined) {
        return null;
      }

      const changes: Partial<typeof events.$inferInsert> = {
        updatedAt: new Date().toISOString(),
      };

      if (input.defaultLocale !== undefined) {
        changes.defaultLocale = input.defaultLocale;
      }
      if (input.title !== undefined) {
        changes.titleJson = input.title;
      }
      if (input.summary !== undefined) {
        changes.summaryJson = input.summary;
      }
      if (input.startsAt !== undefined) {
        changes.startsAt = input.startsAt;
      }
      if (input.endsAt !== undefined) {
        changes.endsAt = input.endsAt;
      }
      if (input.timezone !== undefined) {
        changes.timezone = input.timezone;
      }
      if (input.status !== undefined) {
        changes.status = input.status;
      }
      if (input.enabled !== undefined) {
        changes.enabled = input.enabled;
      }
      if (input.registrationOpen !== undefined) {
        changes.registrationOpen = input.registrationOpen;
      }
      if (input.location !== undefined) {
        changes.locationName = input.location.name;
        changes.locationAddress = input.location.address;
        changes.locationMapUrl = input.location.mapUrl;
        changes.locationMapEmbedUrl = input.location.mapEmbedUrl;
      }
      if (input.notes !== undefined) {
        changes.notesJson = input.notes;
      }
      if (input.payments !== undefined) {
        changes.paymentEtransferEnabled = input.payments.etransfer.enabled;
        changes.paymentEtransferEmail = input.payments.etransfer.email;
        changes.paymentCashEnabled = input.payments.cash.enabled;
        changes.paymentCashAddress = input.payments.cash.address;
        changes.paymentCashMapUrl = input.payments.cash.mapUrl;
        changes.paymentCashMapEmbedUrl = input.payments.cash.mapEmbedUrl;
      }

      const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
        orm.update(events).set(changes).where(eq(events.id, id)),
      ];

      if (input.aliases !== undefined) {
        statements.push(
          orm.delete(eventAliases).where(eq(eventAliases.eventId, id)),
          orm.delete(eventSlugClaims).where(eq(eventSlugClaims.eventId, id)),
        );

        const claims = [...new Set([current.slug, ...input.aliases])];
        statements.push(
          orm.insert(eventSlugClaims).values(claims.map((slug) => ({ slug, eventId: id }))),
        );

        if (input.aliases.length > 0) {
          statements.push(
            orm.insert(eventAliases).values(input.aliases.map((alias) => ({ alias, eventId: id }))),
          );
        }
      }

      if (input.limits !== undefined) {
        statements.push(
          orm
            .update(eventTicketLimits)
            .set({
              currency: input.limits.currency,
              maxTicketsPerRegistration: input.limits.maxTicketsPerRegistration,
              maxTotalTickets: input.limits.maxTotalTickets,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(eventTicketLimits.eventId, id)),
        );
      }

      await orm.batch(statements);

      return findEventDetail(id);
    },
  };
}
