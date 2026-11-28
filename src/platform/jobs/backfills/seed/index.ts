// @boundary server
/* oxlint-disable eslint/max-lines -- Seed fixture assembly is intentionally linear. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { inArray, or, sql, type SQL } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { drizzle } from "drizzle-orm/sqlite-proxy";

import { createD1Context } from "#tooling/d1/d1";
import { toSqlStatement } from "#tooling/d1/sql";
import { defineBackfill } from "#tooling/manage/backfill";
import { USER_ROLE } from "~/features/auth/roles";
import type { EventStatus } from "~/features/events/domain/constants";
import type { EventNotes, LocalizedText, PaymentMethod } from "~/features/events/domain/types";
import { account, user } from "~/platform/server/db/app/schemas/auth-schema";
import {
  auditEvents,
  checkins,
  eventAliases,
  eventFormVersions,
  eventSlugClaims,
  eventTicketLimits,
  eventTicketTypes,
  events,
  payments,
  registrationContacts,
  registrationFieldValues,
  registrationPhoneClaims,
  registrationStats,
  registrationStatusOtps,
  registrationStatusSessions,
  registrationTickets,
  registrations,
  ticketTypeStats,
} from "~/platform/server/db/events/schemas";

interface SeedTicket {
  key: string;
  priceMinor: number;
  label: LocalizedText;
  capacity: number;
  maxPerRegistration: number;
  defaultQuantity: number;
}

interface SeedEvent {
  key: string;
  id: [number, number];
  slug: string;
  eventType: string;
  editionYear: number;
  defaultLocale: string;
  status: EventStatus;
  enabled: boolean;
  registrationOpen: boolean;
  startsAt: string;
  endsAt: string;
  timezone: string;
  title: LocalizedText;
  summary: LocalizedText;
  location: {
    name: string;
    address: string;
    mapUrl: string | null;
    mapEmbedUrl: string | null;
  };
  payments: {
    etransfer: { enabled: boolean; email: string | null };
    cash: {
      enabled: boolean;
      address: string;
      mapUrl: string | null;
      mapEmbedUrl: string | null;
    };
  };
  notes: EventNotes;
  aliases: string[];
  limits: {
    currency: string;
    maxTicketsPerRegistration: number;
    maxTotalTickets: number;
  };
  tickets: SeedTicket[];
  formDetails: boolean;
  customFields: Record<string, unknown>[];
}

/** JSON values accepted by the custom-answer column. */
type SeedAnswerValue = string | number | boolean | null | Record<string, unknown>;

interface SeedRegistration {
  name: string;
  event: string;
  email: string;
  phone: string | null;
  mail: {
    line1: string;
    city: string;
    province: string;
    postal: string;
    country: string;
  } | null;
  tickets: [string, number][];
  answers: Record<string, SeedAnswerValue>;
  payment: { method: PaymentMethod; amount: number; note: string } | null;
  checkin: string | null;
  created: string;
  token: string;
}

interface SeedFixture {
  createdAt: string;
  events: SeedEvent[];
  registrations: SeedRegistration[];
}

const db = drizzle({
  get: () => Promise.resolve(undefined),
  all: () => Promise.resolve([]),
  run: () => Promise.resolve(undefined),
});

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Untyped tooling boundary; the fixture shape is covered by the seed schema tests.
const fixture = JSON.parse(
  await readFile(new URL("seed-events.json", import.meta.url), "utf8"),
) as SeedFixture;

function seededId(prefix: number, number: number) {
  return `01a19000-${prefix.toString(16).padStart(4, "0")}-7000-8000-${number
    .toString()
    .padStart(12, "0")}`;
}

function eventId(event: SeedEvent) {
  return seededId(event.id[0], event.id[1]);
}

export function seedFormSchema(
  activeKeys: string[],
  customFields: Record<string, unknown>[],
  details: boolean,
): Record<string, unknown> {
  const registration = "registration";
  const detailsKey = "details";
  const sections = [
    {
      key: registration,
      order: 10,
      label: { en: "Registration", fr: "Inscription", vi: "Đăng ký" },
    },
  ];

  if (details) {
    sections.push({
      key: detailsKey,
      order: 20,
      label: {
        en: "Additional details",
        fr: "Détails supplémentaires",
        vi: "Thông tin bổ sung",
      },
    });
  }

  const fields: Record<string, unknown>[] = [
    { ref: "system.fullName", section: registration, order: 10, width: "full" },
    { ref: "system.contacts.email", section: registration, order: 20, width: "full" },
    { ref: "system.contacts.phone", section: registration, order: 30, width: "full" },
    { ref: "system.contacts.mail", section: registration, order: 40, width: "full" },
    { ref: "system.confirmation", section: registration, order: 50, width: "full" },
  ];

  for (const [index, key] of activeKeys.entries()) {
    fields.push({
      ref: `system.tickets.${key}`,
      section: registration,
      order: 60 + index,
      width: "full",
    });
  }

  for (const [index, field] of customFields.entries()) {
    fields.push({
      ref: `custom.${String(field.key)}`,
      section: details ? detailsKey : registration,
      order: 10 + index * 10,
      width: "full",
    });
  }

  fields.push({
    ref: "system.consent",
    section: registration,
    order: 140,
    width: "full",
  });

  return {
    version: 4,
    contacts: {
      email: {
        required: true,
        width: "full",
        label: { en: "Email", fr: "Courriel", vi: "Email" },
      },
      phone: {
        required: false,
        width: "full",
        label: { en: "Phone", fr: "Téléphone", vi: "Số điện thoại" },
      },
      mail: {
        required: false,
        width: "full",
        label: { en: "Mailing address", fr: "Adresse postale", vi: "Địa chỉ thư" },
      },
      confirmation: { mode: "optional", methods: ["email"] },
    },
    sections,
    fields,
    customFields,
  };
}

/** Every fixture event's persisted form schema, exposed for schema-drift tests. */
export function seedFormSchemas(): { slug: string; schema: Record<string, unknown> }[] {
  return fixture.events.map((event) => ({
    slug: event.slug,
    schema: seedFormSchema(
      event.tickets.map((ticket) => ticket.key),
      event.customFields,
      event.formDetails,
    ),
  }));
}

function normalizeSeedPhone(value: string) {
  const digits = value.replaceAll(/\D/gu, "");
  return digits.length === 10 ? `+1${digits}` : `+${digits}`;
}

function insertStatement(table: SQLiteTable, rows: Record<string, unknown>[]) {
  if (rows.length === 0) {
    return null;
  }
  return toSqlStatement(db.insert(table).values(rows).getSQL());
}

function deleteStatement(table: SQLiteTable, where: SQL) {
  return toSqlStatement(db.delete(table).where(where).getSQL());
}

function anyOf(...conditions: (SQL | undefined)[]): SQL {
  const result = or(...conditions);
  if (result === undefined) {
    throw new Error("Seed cleanup requires at least one condition.");
  }
  return result;
}

const registrationStatsSql = await readFile(
  new URL("../registration-stats/backfill.sql", import.meta.url),
  "utf8",
);
const REGISTRATION_STATS_SQL = registrationStatsSql.trim();

// oxlint-disable-next-line eslint/max-lines-per-function -- seed fixture assembly is intentionally linear.
function buildRows(): {
  cleanup: string[];
  inserts: string[];
  tokens: [string, string][];
} {
  const { createdAt } = fixture;
  const slugs = fixture.events.map((event) => event.slug);
  const aliases = fixture.events.flatMap((event) => event.aliases);
  const eventsByKey = new Map(fixture.events.map((event) => [event.key, event]));

  const eventIds = db.select({ id: events.id }).from(events).where(inArray(events.slug, slugs));
  const registrationIds = db
    .select({ id: registrations.id })
    .from(registrations)
    .where(inArray(registrations.eventId, eventIds));

  const cleanup = [
    deleteStatement(registrationPhoneClaims, inArray(registrationPhoneClaims.eventId, eventIds)),
    deleteStatement(
      eventSlugClaims,
      anyOf(inArray(eventSlugClaims.eventId, eventIds), inArray(eventSlugClaims.slug, aliases)),
    ),
    deleteStatement(
      registrationStatusOtps,
      inArray(registrationStatusOtps.registrationId, registrationIds),
    ),
    deleteStatement(
      registrationStatusSessions,
      inArray(registrationStatusSessions.registrationId, registrationIds),
    ),
    deleteStatement(checkins, inArray(checkins.registrationId, registrationIds)),
    deleteStatement(payments, inArray(payments.registrationId, registrationIds)),
    deleteStatement(auditEvents, inArray(auditEvents.eventId, eventIds)),
    deleteStatement(
      registrationFieldValues,
      inArray(registrationFieldValues.registrationId, registrationIds),
    ),
    deleteStatement(
      registrationTickets,
      inArray(registrationTickets.registrationId, registrationIds),
    ),
    deleteStatement(
      registrationContacts,
      inArray(registrationContacts.registrationId, registrationIds),
    ),
    deleteStatement(registrations, inArray(registrations.eventId, eventIds)),
    deleteStatement(ticketTypeStats, inArray(ticketTypeStats.eventId, eventIds)),
    deleteStatement(registrationStats, inArray(registrationStats.eventId, eventIds)),
    deleteStatement(eventFormVersions, inArray(eventFormVersions.eventId, eventIds)),
    deleteStatement(eventTicketTypes, inArray(eventTicketTypes.eventId, eventIds)),
    deleteStatement(eventTicketLimits, inArray(eventTicketLimits.eventId, eventIds)),
    deleteStatement(
      eventAliases,
      anyOf(inArray(eventAliases.eventId, eventIds), inArray(eventAliases.alias, aliases)),
    ),
    deleteStatement(events, inArray(events.slug, slugs)),
  ];

  const eventRows: (typeof events.$inferInsert)[] = fixture.events.map((event) => ({
    id: eventId(event),
    slug: event.slug,
    eventType: event.eventType,
    editionYear: event.editionYear,
    defaultLocale: event.defaultLocale,
    status: event.status,
    enabled: event.enabled,
    registrationOpen: event.registrationOpen,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    timezone: event.timezone,
    titleJson: event.title,
    summaryJson: event.summary,
    locationName: event.location.name,
    locationAddress: event.location.address,
    locationMapUrl: event.location.mapUrl,
    locationMapEmbedUrl: event.location.mapEmbedUrl,
    paymentEtransferEnabled: event.payments.etransfer.enabled,
    paymentEtransferEmail: event.payments.etransfer.email,
    paymentCashEnabled: event.payments.cash.enabled,
    paymentCashAddress: event.payments.cash.address,
    paymentCashMapUrl: event.payments.cash.mapUrl,
    paymentCashMapEmbedUrl: event.payments.cash.mapEmbedUrl,
    notesJson: event.notes,
    createdAt,
    updatedAt: createdAt,
  }));

  const slugClaimRows: (typeof eventSlugClaims.$inferInsert)[] = [
    ...fixture.events.map((event) => ({ slug: event.slug, eventId: eventId(event) })),
    ...fixture.events.flatMap((event) =>
      event.aliases.map((alias) => ({ slug: alias, eventId: eventId(event) })),
    ),
  ];

  const limitsRows: (typeof eventTicketLimits.$inferInsert)[] = fixture.events.map((event) => ({
    eventId: eventId(event),
    currency: event.limits.currency,
    maxTicketsPerRegistration: event.limits.maxTicketsPerRegistration,
    maxTotalTickets: event.limits.maxTotalTickets,
  }));

  const ticketRows: (typeof eventTicketTypes.$inferInsert)[] = fixture.events.flatMap((event) =>
    event.tickets.map((ticket, index) => ({
      eventId: eventId(event),
      key: ticket.key,
      labelJson: ticket.label,
      descriptionJson: null,
      priceMinor: ticket.priceMinor,
      minPerRegistration: 0,
      maxPerRegistration: ticket.maxPerRegistration,
      defaultQuantity: ticket.defaultQuantity,
      capacity: ticket.capacity,
      active: true,
      sortOrder: 10 + index * 10,
    })),
  );

  const formRows: (typeof eventFormVersions.$inferInsert)[] = fixture.events.map((event) => ({
    eventId: eventId(event),
    version: 1,
    schemaJson: seedFormSchema(
      event.tickets.map((ticket) => ticket.key),
      event.customFields,
      event.formDetails,
    ),
    status: "published",
    createdBy: "seed-admin",
    publishedAt: createdAt,
  }));

  const aliasRows: (typeof eventAliases.$inferInsert)[] = fixture.events.flatMap((event) =>
    event.aliases.map((alias) => ({ alias, eventId: eventId(event), createdAt })),
  );

  const registrationRows: (typeof registrations.$inferInsert)[] = [];
  const contactRows: (typeof registrationContacts.$inferInsert)[] = [];
  const phoneClaimRows: (typeof registrationPhoneClaims.$inferInsert)[] = [];
  const ticketPurchaseRows: (typeof registrationTickets.$inferInsert)[] = [];
  const answerRows: (typeof registrationFieldValues.$inferInsert)[] = [];
  const paymentRows: (typeof payments.$inferInsert)[] = [];
  const auditRows: (typeof auditEvents.$inferInsert)[] = [];
  const checkinRows: (typeof checkins.$inferInsert)[] = [];
  const sessionRows: (typeof registrationStatusSessions.$inferInsert)[] = [];
  const tokens: [string, string][] = [];
  let contactNumber = 1;

  for (const [index, registration] of fixture.registrations.entries()) {
    const registrationId = seededId(1, index + 1);
    const event = eventsByKey.get(registration.event);
    if (event === undefined) {
      throw new Error(`Unknown seed event: ${registration.event}`);
    }
    const eventIdentifier = eventId(event);
    const fullNameNormalized = registration.name.toLowerCase();

    registrationRows.push({
      id: registrationId,
      eventId: eventIdentifier,
      formVersion: 1,
      fullName: registration.name,
      fullNameNormalized,
      consentAt: registration.created,
      metadataJson: { source: "seed", locale: "en" },
      createdAt: registration.created,
    });

    const contacts = [
      { kind: "email" as const, email: registration.email },
      ...(registration.phone === null
        ? []
        : [{ kind: "phone" as const, phone: registration.phone }]),
      ...(registration.mail === null ? [] : [{ kind: "mail" as const, mail: registration.mail }]),
    ];

    for (const contact of contacts) {
      const email = "email" in contact ? contact.email : undefined;
      const phone = "phone" in contact ? contact.phone : undefined;
      const mail = "mail" in contact ? contact.mail : undefined;
      contactRows.push({
        id: seededId(2, contactNumber),
        registrationId,
        eventId: eventIdentifier,
        kind: contact.kind,
        label: null,
        isPrimary: contact.kind === "email",
        isConfirmationMethod: contact.kind === "email",
        emailAddress: email ?? null,
        emailNormalized: email?.toLowerCase() ?? null,
        phoneNumber: phone ?? null,
        phoneNormalized: phone === undefined ? null : normalizeSeedPhone(phone),
        addressLine1: mail?.line1 ?? null,
        addressLine2: null,
        city: mail?.city ?? null,
        province: mail?.province ?? null,
        postalCode: mail?.postal ?? null,
        country: mail?.country ?? null,
        valueJson: {},
        createdAt: registration.created,
      });

      if (phone !== undefined) {
        phoneClaimRows.push({
          registrationId,
          eventId: eventIdentifier,
          phoneNormalized: normalizeSeedPhone(phone),
          fullNameNormalized,
        });
      }
      contactNumber += 1;
    }

    const ticketMap = new Map(event.tickets.map((ticket) => [ticket.key, ticket]));
    for (const [key, quantity] of registration.tickets) {
      const ticket = ticketMap.get(key);
      if (ticket === undefined) {
        throw new Error(`Unknown seed ticket ${key} for event ${event.slug}`);
      }
      ticketPurchaseRows.push({
        registrationId,
        eventId: eventIdentifier,
        ticketTypeKey: key,
        quantity,
        unitPriceMinor: ticket.priceMinor,
        currency: "CAD",
        labelSnapshotJson: ticket.label,
        createdAt: registration.created,
      });
    }

    for (const [fieldKey, value] of Object.entries(registration.answers)) {
      answerRows.push({
        registrationId,
        eventId: eventIdentifier,
        fieldKey,
        formVersion: 1,
        valueJson: value,
        createdAt: registration.created,
      });
    }

    if (registration.payment !== null) {
      paymentRows.push({
        id: seededId(3, index + 1),
        eventId: eventIdentifier,
        registrationId,
        amountMinor: registration.payment.amount,
        currency: "CAD",
        method: registration.payment.method,
        confirmedBy: "seed-admin",
        note: registration.payment.note,
        createdAt: registration.created,
        updatedAt: registration.created,
      });
      auditRows.push({
        id: seededId(5, index + 1),
        eventId: eventIdentifier,
        actorUserId: "seed-admin",
        action: "payment.confirm",
        targetId: registrationId,
        metadata: {
          amountMinor: registration.payment.amount,
          currency: "CAD",
          method: registration.payment.method,
        },
        createdAt: registration.created,
      });
    }

    if (registration.checkin !== null) {
      checkinRows.push({
        id: seededId(4, index + 1),
        eventId: eventIdentifier,
        registrationId,
        checkedInAt: registration.checkin,
      });
    }

    sessionRows.push({
      id: seededId(6, index + 1),
      registrationId,
      tokenHash: createHash("sha256").update(registration.token).digest("hex"),
      expiresAt: "2027-12-31T23:59:59.999Z",
      createdAt: registration.created,
    });
    tokens.push([registration.name, registration.token]);
  }

  const inserts = [
    insertStatement(events, eventRows),
    insertStatement(eventSlugClaims, slugClaimRows),
    insertStatement(eventTicketLimits, limitsRows),
    insertStatement(eventTicketTypes, ticketRows),
    insertStatement(eventFormVersions, formRows),
    insertStatement(eventAliases, aliasRows),
    insertStatement(registrations, registrationRows),
    insertStatement(registrationContacts, contactRows),
    insertStatement(registrationPhoneClaims, phoneClaimRows),
    insertStatement(registrationTickets, ticketPurchaseRows),
    insertStatement(registrationFieldValues, answerRows),
    insertStatement(payments, paymentRows),
    insertStatement(auditEvents, auditRows),
    insertStatement(checkins, checkinRows),
    insertStatement(registrationStatusSessions, sessionRows),
    REGISTRATION_STATS_SQL,
  ].filter((value): value is string => value !== null);

  return { cleanup, inserts, tokens };
}

export function seedEventSql(): { sql: string; tokens: [string, string][] } {
  const { cleanup, inserts, tokens } = buildRows();
  return { sql: [...cleanup, ...inserts].join("\n"), tokens };
}

/** Seed better-auth staff accounts with verified emails for passwordless OTP sign-in. */
export async function seedUsersSql(): Promise<string> {
  const now = Date.now();
  const createdAt = new Date(now);
  const userIds = [seededId(9, 1), seededId(9, 2)] as const;

  return [
    toSqlStatement(db.delete(account).where(inArray(account.userId, userIds)).getSQL()),
    toSqlStatement(
      db
        .insert(user)
        .values([
          {
            id: userIds[0],
            name: "Admin",
            email: "admin@example.com",
            emailVerified: true,
            createdAt,
            updatedAt: createdAt,
            role: USER_ROLE.admin,
          },
          {
            id: userIds[1],
            name: "Staff",
            email: "staff@example.com",
            emailVerified: true,
            createdAt,
            updatedAt: createdAt,
            role: USER_ROLE.event_staff,
          },
        ])
        .onConflictDoUpdate({
          target: user.email,
          set: { role: sql`excluded.role`, emailVerified: true },
        })
        .getSQL(),
    ),
  ].join("\n");
}

export default defineBackfill({
  description: "Recreate local development fixtures.",
  usage: "node --import ./scripts/register-node.ts manage.ts seed --target local",
  run: async (context, args) => {
    if (args.length > 0) {
      throw new Error("seed does not accept arguments.");
    }

    const d1 = await createD1Context(context.target, context.dryRun, context.log);

    if (d1.target !== "local") {
      throw new Error("Seed data is local-only.");
    }

    const { sql: seedSql, tokens } = seedEventSql();
    d1.log("Seeding local APP_DB users.");
    await d1.database.executeFile("APP_DB", "seed-users.sql", await seedUsersSql());
    d1.log("Seeding local EVENT_ENGINE_DB event data.");
    await d1.database.executeFile("EVENT_ENGINE_DB", "seed-events.sql", seedSql);
    d1.log("Seed complete. Test status links:");
    for (const [name, token] of tokens) {
      d1.log(
        `  ${name.padEnd(22)} http://localhost:4321/api/events/status/link?token=${encodeURIComponent(token)}&locale=en`,
      );
    }
    d1.log("Local users: admin@example.com / staff@example.com (email OTP sign-in)");
  },
});
