// @boundary server
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { events } from "./events";
import { eventFormVersions } from "./forms";
import { defineTable, timestamp } from "./shared";

export const registrations = defineTable(
  "registrations",
  {
    id: text().primaryKey(),
    eventId: text().notNull(),
    formVersion: integer(),
    fullName: text().notNull(),
    fullNameNormalized: text().notNull(),
    manual: integer({ mode: "boolean" })
      .notNull()
      .default(sql`0`),
    consentAt: text().notNull(),
    metadataJson: text({ mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp(),
  },
  (table) => [
    foreignKey({ columns: [table.eventId], foreignColumns: [events.id] }).onDelete("restrict"),
    foreignKey({
      columns: [table.eventId, table.formVersion],
      foreignColumns: [eventFormVersions.eventId, eventFormVersions.version],
    }),
    uniqueIndex("registrations_id_event_unique").on(table.id, table.eventId),
    uniqueIndex("registrations_id_event_form_version_unique").on(
      table.id,
      table.eventId,
      table.formVersion,
    ),
    index("registrations_event_created_at").on(table.eventId, table.createdAt, table.id),
    check(
      "registrations_metadata_json",
      sql`json_valid(${table.metadataJson}) AND json_type(${table.metadataJson}) = 'object' AND length(${table.metadataJson}) <= 16384`,
    ),
  ],
);

export const registrationContacts = defineTable(
  "registration_contacts",
  {
    id: text().primaryKey(),
    registrationId: text().notNull(),
    eventId: text().notNull(),
    kind: text().notNull(),
    label: text(),
    isPrimary: integer({ mode: "boolean" })
      .notNull()
      .default(sql`0`),
    isConfirmationMethod: integer({ mode: "boolean" })
      .notNull()
      .default(sql`0`),
    manual: integer({ mode: "boolean" })
      .notNull()
      .default(sql`0`),
    emailAddress: text(),
    emailNormalized: text(),
    phoneNumber: text(),
    phoneNormalized: text(),
    addressLine1: text(),
    addressLine2: text(),
    city: text(),
    province: text(),
    postalCode: text(),
    country: text(),
    valueJson: text({ mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp(),
  },
  (table) => [
    foreignKey({
      columns: [table.registrationId, table.eventId],
      foreignColumns: [registrations.id, registrations.eventId],
    }).onDelete("cascade"),
    foreignKey({ columns: [table.eventId], foreignColumns: [events.id] }).onDelete("restrict"),
    index("registration_contacts_registration").on(table.registrationId, table.kind),
    uniqueIndex("registration_contacts_one_primary")
      .on(table.registrationId)
      .where(sql`${table.isPrimary} = 1`),
    uniqueIndex("registration_contacts_one_confirmation")
      .on(table.registrationId)
      .where(sql`${table.isConfirmationMethod} = 1`),
    uniqueIndex("registration_contacts_one_mail")
      .on(table.registrationId)
      .where(sql`${table.kind} = 'mail'`),
    uniqueIndex("registration_contacts_event_email")
      .on(table.eventId, table.emailNormalized)
      .where(
        sql`${table.kind} = 'email' AND ${table.emailNormalized} IS NOT NULL AND ${table.manual} = 0`,
      ),
    uniqueIndex("registration_contacts_registration_phone")
      .on(table.registrationId, table.phoneNormalized)
      .where(sql`${table.kind} = 'phone' AND ${table.phoneNormalized} IS NOT NULL`),
    index("registration_contacts_event_phone")
      .on(table.eventId, table.phoneNormalized)
      .where(sql`${table.kind} = 'phone' AND ${table.phoneNormalized} IS NOT NULL`),
    index("registration_contacts_event_postal")
      .on(table.eventId, table.postalCode)
      .where(sql`${table.kind} = 'mail'`),
    check("registration_contacts_kind", sql`${table.kind} IN ('email', 'phone', 'mail')`),
    check("registration_contacts_primary", sql`${table.isPrimary} IN (0, 1)`),
    check("registration_contacts_confirmation", sql`${table.isConfirmationMethod} IN (0, 1)`),
    check(
      "registration_contacts_country",
      sql`${table.country} IS NULL OR length(${table.country}) = 2`,
    ),
    check(
      "registration_contacts_value_json",
      sql`json_valid(${table.valueJson}) AND json_type(${table.valueJson}) = 'object' AND length(${table.valueJson}) <= 4096`,
    ),
    check(
      "registration_contacts_shape",
      sql`(
        ${table.kind} = 'email'
        AND ${table.emailAddress} IS NOT NULL
        AND ${table.emailNormalized} IS NOT NULL
        AND ${table.phoneNumber} IS NULL
        AND ${table.phoneNormalized} IS NULL
        AND ${table.addressLine1} IS NULL
        AND ${table.addressLine2} IS NULL
        AND ${table.city} IS NULL
        AND ${table.province} IS NULL
        AND ${table.postalCode} IS NULL
        AND ${table.country} IS NULL
      ) OR (
        ${table.kind} = 'phone'
        AND ${table.phoneNumber} IS NOT NULL
        AND ${table.phoneNormalized} IS NOT NULL
        AND ${table.emailAddress} IS NULL
        AND ${table.emailNormalized} IS NULL
        AND ${table.addressLine1} IS NULL
        AND ${table.addressLine2} IS NULL
        AND ${table.city} IS NULL
        AND ${table.province} IS NULL
        AND ${table.postalCode} IS NULL
        AND ${table.country} IS NULL
      ) OR (
        ${table.kind} = 'mail'
        AND ${table.addressLine1} IS NOT NULL
        AND ${table.city} IS NOT NULL
        AND ${table.province} IS NOT NULL
        AND ${table.postalCode} IS NOT NULL
        AND ${table.country} IS NOT NULL
        AND ${table.emailAddress} IS NULL
        AND ${table.emailNormalized} IS NULL
        AND ${table.phoneNumber} IS NULL
        AND ${table.phoneNormalized} IS NULL
      )`,
    ),
  ],
);

export const registrationPhoneClaims = defineTable(
  "registration_phone_claims",
  {
    registrationId: text().notNull(),
    eventId: text().notNull(),
    phoneNormalized: text().notNull(),
    fullNameNormalized: text().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.registrationId, table.phoneNormalized] }),
    uniqueIndex("registration_phone_claims_identity").on(
      table.eventId,
      table.phoneNormalized,
      table.fullNameNormalized,
    ),
    foreignKey({ columns: [table.registrationId], foreignColumns: [registrations.id] }).onDelete(
      "cascade",
    ),
    foreignKey({ columns: [table.eventId], foreignColumns: [events.id] }).onDelete("restrict"),
  ],
);
