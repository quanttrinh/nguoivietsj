/* oxlint-disable eslint/max-lines-per-function -- Registration queries share one repository. */
/* oxlint-disable unicorn/max-nested-calls -- Drizzle query builders are nested by design. */
import { and, count, desc, eq, exists, inArray, or, sql, type SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { CONTACT_KIND, FORM_VERSION_STATUS } from "~/events/domain/constants";
import type {
  FormVersionRecord,
  PreparedRegistration,
  RegistrationContactRecord,
  RegistrationRecord,
  RegistrationSummary,
  RegistrationTicketRecord,
} from "~/events/domain/types";
import { NON_DIGIT_REGEX } from "~/shared/constants/patterns";
import { newId } from "~/shared/utils/uuid";

import { toFormVersion } from "./form-versions";
import type { EngineOrm } from "./orm";
import {
  checkins,
  eventFormVersions,
  payments,
  registrationContacts,
  registrationFieldValues,
  registrationPhoneClaims,
  registrationStats,
  registrationStatusSessions,
  registrationTickets,
  registrations,
  ticketTypeStats,
} from "./schema";

export interface DuplicateIdentity {
  emails: string[];
  phones: string[];
  fullNameNormalized: string;
}

type ContactRow = typeof registrationContacts.$inferSelect;
type TicketRow = typeof registrationTickets.$inferSelect;
type AnswerRow = typeof registrationFieldValues.$inferSelect;
type RegistrationRow = typeof registrations.$inferSelect;

function toContactRecord(contact: ContactRow): RegistrationContactRecord {
  const base = {
    id: contact.id,
    label: contact.label,
    isPrimary: contact.isPrimary,
    isConfirmation: contact.isConfirmationMethod,
    value: contact.valueJson,
  };

  if (contact.kind === CONTACT_KIND.email) {
    return {
      ...base,
      kind: CONTACT_KIND.email,
      emailAddress: contact.emailAddress ?? "",
      phoneNumber: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      province: null,
      postalCode: null,
      country: null,
    };
  }

  if (contact.kind === CONTACT_KIND.phone) {
    return {
      ...base,
      kind: CONTACT_KIND.phone,
      emailAddress: null,
      phoneNumber: contact.phoneNumber ?? "",
      addressLine1: null,
      addressLine2: null,
      city: null,
      province: null,
      postalCode: null,
      country: null,
    };
  }

  return {
    ...base,
    kind: CONTACT_KIND.mail,
    emailAddress: null,
    phoneNumber: null,
    addressLine1: contact.addressLine1 ?? "",
    addressLine2: contact.addressLine2,
    city: contact.city ?? "",
    province: contact.province ?? "",
    postalCode: contact.postalCode ?? "",
    country: contact.country ?? "",
  };
}

function toTicketRecord(ticket: TicketRow): RegistrationTicketRecord {
  return {
    key: ticket.ticketTypeKey,
    quantity: ticket.quantity,
    unitPriceMinor: ticket.unitPriceMinor,
    currency: ticket.currency,
    label: ticket.labelSnapshotJson,
  };
}

function toRegistrationSummary(row: {
  registration: RegistrationRow;
  contacts: ContactRow[];
  tickets: TicketRow[];
}): RegistrationSummary {
  return {
    id: row.registration.id,
    eventId: row.registration.eventId,
    formVersion: row.registration.formVersion,
    fullName: row.registration.fullName,
    createdAt: row.registration.createdAt,
    metadata: row.registration.metadataJson,
    contacts: row.contacts.map(toContactRecord),
    tickets: row.tickets.map(toTicketRecord),
  };
}

function toRegistration(row: {
  registration: RegistrationRow;
  contacts: ContactRow[];
  tickets: TicketRow[];
  answers: AnswerRow[];
}): RegistrationRecord {
  return {
    ...toRegistrationSummary(row),
    answers: Object.fromEntries(row.answers.map((answer) => [answer.fieldKey, answer.valueJson])),
  };
}

export type RegistrationPaymentFilter = "paid" | "unpaid";
export type RegistrationCheckinFilter = "checked_in" | "not_checked_in";

export interface RegistrationSearchOptions {
  query?: string;
  payment?: RegistrationPaymentFilter | undefined;
  checkin?: RegistrationCheckinFilter | undefined;
  limit: number;
  offset: number;
}

export interface RegistrationSearchResult {
  registrations: RegistrationSummary[];
  total: number;
}

export interface RegistrationCreateContext {
  formVersion: FormVersionRecord | null;
  duplicate: boolean;
}

export interface RegistrationRepository {
  findCreateContext: (
    eventId: string,
    formVersion: number | null,
    identity: DuplicateIdentity,
  ) => Promise<RegistrationCreateContext>;
  create: (registration: PreparedRegistration) => Promise<void>;
  listByEvent: (eventId: string, limit: number) => Promise<RegistrationRecord[]>;
  listSummariesByEvent: (eventId: string, limit: number) => Promise<RegistrationSummary[]>;
  searchByEvent: (
    eventId: string,
    options: RegistrationSearchOptions,
  ) => Promise<RegistrationSearchResult>;
  findById: (eventId: string, id: string) => Promise<RegistrationRecord | null>;
}

/** One predicate for email duplicates and full-name/phone duplicates. */
function duplicateCondition(eventId: string, identity: DuplicateIdentity): SQL {
  const conditions: SQL[] = [];

  if (identity.emails.length > 0) {
    conditions.push(
      and(
        eq(registrationContacts.kind, CONTACT_KIND.email),
        inArray(registrationContacts.emailNormalized, identity.emails),
      ) ?? sql`0 = 1`,
    );
  }

  if (identity.phones.length > 0) {
    conditions.push(
      and(
        eq(registrationContacts.kind, CONTACT_KIND.phone),
        inArray(registrationContacts.phoneNormalized, identity.phones),
        eq(registrations.fullNameNormalized, identity.fullNameNormalized),
      ) ?? sql`0 = 1`,
    );
  }

  return (
    and(
      eq(registrationContacts.eventId, eventId),
      conditions.length > 0 ? (or(...conditions) ?? sql`0 = 1`) : sql`0 = 1`,
    ) ?? sql`0 = 1`
  );
}

function formVersionCondition(eventId: string, formVersion: number | null): SQL {
  return (
    (formVersion === null
      ? and(
          eq(eventFormVersions.eventId, eventId),
          eq(eventFormVersions.status, FORM_VERSION_STATUS.published),
        )
      : and(eq(eventFormVersions.eventId, eventId), eq(eventFormVersions.version, formVersion))) ??
    sql`0 = 1`
  );
}

export function createRegistrationRepository(orm: EngineOrm): RegistrationRepository {
  return {
    async findCreateContext(eventId, formVersion, identity) {
      const [formRows, duplicateRows] = await orm.batch([
        orm
          .select()
          .from(eventFormVersions)
          .where(formVersionCondition(eventId, formVersion))
          .limit(1),
        orm
          .select({ id: registrationContacts.id })
          .from(registrationContacts)
          .innerJoin(registrations, eq(registrations.id, registrationContacts.registrationId))
          .where(duplicateCondition(eventId, identity))
          .limit(1),
      ]);
      const formRow = formRows[0];

      return {
        formVersion: formRow === undefined ? null : toFormVersion(formRow),
        duplicate: duplicateRows.length > 0,
      };
    },

    async create(registration) {
      const metadata = JSON.parse(registration.metadataJson) as Record<string, unknown>;
      const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
        orm.insert(registrations).values({
          id: registration.id,
          eventId: registration.eventId,
          formVersion: registration.formVersion,
          fullName: registration.fullName,
          fullNameNormalized: registration.fullNameNormalized,
          consentAt: registration.consentAt,
          metadataJson: metadata,
        }),
        orm.insert(registrationStatusSessions).values({
          id: newId(),
          registrationId: registration.id,
          tokenHash: registration.statusTokenHash,
          expiresAt: registration.statusTokenExpiresAt,
        }),
        orm
          .insert(registrationStats)
          .values({
            eventId: registration.eventId,
            registrationCount: 1,
            ticketsTotal: 0,
          })
          .onConflictDoUpdate({
            target: registrationStats.eventId,
            set: {
              registrationCount: sql`${registrationStats.registrationCount} + 1`,
            },
          }),
      ];

      if (registration.contacts.length > 0) {
        statements.push(
          orm.insert(registrationContacts).values(
            registration.contacts.map((contact) => ({
              id: contact.id,
              registrationId: registration.id,
              eventId: registration.eventId,
              kind: contact.kind,
              label: contact.label,
              isPrimary: contact.isPrimary,
              isConfirmationMethod: contact.isConfirmation,
              emailAddress: contact.email,
              emailNormalized: contact.emailNormalized,
              phoneNumber: contact.phone,
              phoneNormalized: contact.phoneNormalized,
              addressLine1: contact.addressLine1,
              addressLine2: contact.addressLine2,
              city: contact.city,
              province: contact.province,
              postalCode: contact.postalCode,
              country: contact.country,
              valueJson: contact.value,
            })),
          ),
        );
      }

      const phoneClaims = new Map<string, string>();

      for (const contact of registration.contacts) {
        if (contact.phoneNormalized !== null) {
          phoneClaims.set(contact.phoneNormalized, registration.fullNameNormalized);
        }
      }

      if (phoneClaims.size > 0) {
        statements.push(
          orm.insert(registrationPhoneClaims).values(
            [...phoneClaims].map(([phoneNormalized, fullNameNormalized]) => ({
              registrationId: registration.id,
              eventId: registration.eventId,
              phoneNormalized,
              fullNameNormalized,
            })),
          ),
        );
      }

      const ticketStats = new Map<string, number>();

      for (const ticket of registration.tickets) {
        // Insert before updating the counters.
        // The capacity triggers see pre-insert totals and later lines see updated totals.
        statements.push(
          orm.insert(registrationTickets).values({
            registrationId: registration.id,
            eventId: registration.eventId,
            ticketTypeKey: ticket.key,
            quantity: ticket.quantity,
            unitPriceMinor: ticket.unitPriceMinor,
            currency: ticket.currency,
            labelSnapshotJson: ticket.label,
          }),
          orm
            .update(registrationStats)
            .set({
              ticketsTotal: sql`${registrationStats.ticketsTotal} + ${ticket.quantity}`,
            })
            .where(eq(registrationStats.eventId, registration.eventId)),
        );
        ticketStats.set(ticket.key, ticket.quantity);
      }

      // Insert after the ticket rows so type capacity triggers see pre-insert totals.
      if (ticketStats.size > 0) {
        statements.push(
          orm
            .insert(ticketTypeStats)
            .values(
              [...ticketStats].map(([ticketTypeKey, ticketsSold]) => ({
                eventId: registration.eventId,
                ticketTypeKey,
                ticketsSold,
              })),
            )
            .onConflictDoUpdate({
              target: [ticketTypeStats.eventId, ticketTypeStats.ticketTypeKey],
              set: {
                ticketsSold: sql`${ticketTypeStats.ticketsSold} + excluded.tickets_sold`,
              },
            }),
        );
      }

      if (registration.answers.length > 0) {
        statements.push(
          orm.insert(registrationFieldValues).values(
            registration.answers.map((answer) => ({
              registrationId: registration.id,
              eventId: registration.eventId,
              fieldKey: answer.fieldKey,
              formVersion: registration.formVersion ?? 0,
              valueJson: JSON.parse(answer.valueJson) as Record<string, unknown>,
            })),
          ),
        );
      }

      await orm.batch(statements);
    },

    async listByEvent(eventId, limit) {
      const rows = await orm.query.registrations.findMany({
        where: eq(registrations.eventId, eventId),
        with: { contacts: true, tickets: true, answers: true },
        orderBy: [desc(registrations.createdAt), desc(registrations.id)],
        limit,
      });

      return rows.map((row) =>
        toRegistration({
          registration: row,
          contacts: row.contacts,
          tickets: row.tickets,
          answers: row.answers,
        }),
      );
    },

    async listSummariesByEvent(eventId, limit) {
      const rows = await orm.query.registrations.findMany({
        where: eq(registrations.eventId, eventId),
        with: { contacts: true, tickets: true },
        orderBy: [desc(registrations.createdAt), desc(registrations.id)],
        limit,
      });

      return rows.map((row) =>
        toRegistrationSummary({
          registration: row,
          contacts: row.contacts,
          tickets: row.tickets,
        }),
      );
    },

    async searchByEvent(eventId, options) {
      const query = (options.query ?? "").trim().toLowerCase();
      const filters: SQL[] = [eq(registrations.eventId, eventId)];

      if (query.length > 0) {
        const phoneDigits = query.replaceAll(NON_DIGIT_REGEX, "");
        const phoneNeedle = phoneDigits.length >= 3 ? phoneDigits : query;

        const searchCondition = or(
          eq(registrations.id, query),
          sql`instr(${registrations.fullNameNormalized}, ${query}) > 0`,
          exists(
            orm
              .select({ id: registrationContacts.id })
              .from(registrationContacts)
              .where(
                and(
                  eq(registrationContacts.registrationId, registrations.id),
                  or(
                    sql`instr(${registrationContacts.emailNormalized}, ${query}) > 0`,
                    sql`instr(${registrationContacts.phoneNormalized}, ${phoneNeedle}) > 0`,
                  ),
                ),
              ),
          ),
        );

        if (searchCondition !== undefined) {
          filters.push(searchCondition);
        }
      }

      if (options.payment === "paid") {
        filters.push(
          exists(
            orm
              .select({ id: payments.id })
              .from(payments)
              .where(eq(payments.registrationId, registrations.id)),
          ) ?? sql`0 = 1`,
        );
      } else if (options.payment === "unpaid") {
        filters.push(
          sql`NOT ${exists(
            orm
              .select({ id: payments.id })
              .from(payments)
              .where(eq(payments.registrationId, registrations.id)),
          )}`,
        );
      }

      if (options.checkin === "checked_in") {
        filters.push(
          exists(
            orm
              .select({ id: checkins.id })
              .from(checkins)
              .where(eq(checkins.registrationId, registrations.id)),
          ) ?? sql`0 = 1`,
        );
      } else if (options.checkin === "not_checked_in") {
        filters.push(
          sql`NOT ${exists(
            orm
              .select({ id: checkins.id })
              .from(checkins)
              .where(eq(checkins.registrationId, registrations.id)),
          )}`,
        );
      }

      const where = and(...filters);
      const [rows, totalRow] = await Promise.all([
        orm.query.registrations.findMany({
          where,
          with: { contacts: true, tickets: true },
          orderBy: [desc(registrations.createdAt), desc(registrations.id)],
          limit: options.limit,
          offset: options.offset,
        }),
        orm.select({ total: count() }).from(registrations).where(where).get(),
      ]);

      return {
        registrations: rows.map((row) =>
          toRegistrationSummary({
            registration: row,
            contacts: row.contacts,
            tickets: row.tickets,
          }),
        ),
        total: totalRow?.total ?? 0,
      };
    },

    async findById(eventId, id) {
      const row = await orm.query.registrations.findFirst({
        where: and(eq(registrations.eventId, eventId), eq(registrations.id, id)),
        with: { contacts: true, tickets: true, answers: true },
      });

      return row === undefined
        ? null
        : toRegistration({
            registration: row,
            contacts: row.contacts,
            tickets: row.tickets,
            answers: row.answers,
          });
    },
  };
}
