// @boundary server
/* oxlint-disable eslint/max-lines-per-function -- Registration queries share one repository. */
/* oxlint-disable unicorn/max-nested-calls -- Drizzle query builders are nested by design. */
import { and, asc, desc, eq, exists, gte, inArray, not, or, sql, type SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { CONTACT_KIND, FORM_VERSION_STATUS } from "~/features/events/domain/constants";
import type {
  FormVersionRecord,
  PreparedRegistration,
  RegistrationContactRecord,
  RegistrationRecord,
  RegistrationSummary,
  RegistrationTicketRecord,
} from "~/features/events/domain/types";
import type { RegistrationCursor } from "~/features/events/server/pagination";
import { newId } from "~/platform/utils/uuid";

import { toFormVersion } from "./form-versions";
import { databaseSingleton, type EngineOrm } from "./orm";
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
} from "./schemas";
import { fullTextSearchQuery, phoneSearchDigits } from "./search";

export interface DuplicateIdentity {
  emails: string[];
  phones: string[];
  fullNameNormalized: string;
}

type ContactRow = typeof registrationContacts.$inferSelect;
type TicketRow = typeof registrationTickets.$inferSelect;
type AnswerRow = typeof registrationFieldValues.$inferSelect;
type RegistrationRow = typeof registrations.$inferSelect;

function toRegistrationCursor(row: { id: string; createdAt: string }): RegistrationCursor {
  return { createdAt: row.createdAt, id: row.id };
}

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

type RegistrationWithDetails = RegistrationRow & {
  contacts: ContactRow[];
  tickets: TicketRow[];
};

type RegistrationWithAnswers = RegistrationWithDetails & {
  answers: AnswerRow[];
};

function toRegistrationSummary(row: RegistrationWithDetails): RegistrationSummary {
  return {
    id: row.id,
    eventId: row.eventId,
    formVersion: row.formVersion,
    fullName: row.fullName,
    createdAt: row.createdAt,
    metadata: row.metadataJson,
    contacts: row.contacts.map(toContactRecord),
    tickets: row.tickets.map(toTicketRecord),
  };
}

function toRegistration(row: RegistrationWithAnswers): RegistrationRecord {
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
  /** Fetch rows immediately before this position (descending order). */
  before?: RegistrationCursor | undefined;
  /** Fetch rows immediately after this position (descending order). */
  after?: RegistrationCursor | undefined;
}

export interface RegistrationSearchResult {
  registrations: RegistrationSummary[];
  hasNext: boolean;
  hasPrev: boolean;
  nextCursor: RegistrationCursor | null;
  prevCursor: RegistrationCursor | null;
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
function duplicateCondition(orm: EngineOrm, eventId: string, identity: DuplicateIdentity): SQL {
  const conditions: SQL[] = [];

  if (identity.emails.length > 0) {
    conditions.push(
      exists(
        orm
          .select({ id: registrationContacts.id })
          .from(registrationContacts)
          .where(
            and(
              eq(registrationContacts.eventId, eventId),
              eq(registrationContacts.kind, CONTACT_KIND.email),
              inArray(registrationContacts.emailNormalized, identity.emails),
              eq(registrationContacts.manual, false),
            ),
          ),
      ),
    );
  }

  if (identity.phones.length > 0) {
    conditions.push(
      exists(
        orm
          .select({ registrationId: registrationPhoneClaims.registrationId })
          .from(registrationPhoneClaims)
          .where(
            and(
              eq(registrationPhoneClaims.eventId, eventId),
              inArray(registrationPhoneClaims.phoneNormalized, identity.phones),
              eq(registrationPhoneClaims.fullNameNormalized, identity.fullNameNormalized),
            ),
          ),
      ),
    );
  }

  return or(...conditions) ?? sql`0 = 1`;
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

function createRegistrationRepository(orm: EngineOrm): RegistrationRepository {
  return {
    async findCreateContext(eventId, formVersion, identity) {
      const formQuery = orm
        .select()
        .from(eventFormVersions)
        .where(formVersionCondition(eventId, formVersion))
        .limit(1);

      if (identity.emails.length === 0 && identity.phones.length === 0) {
        const formRows = await formQuery;
        const formRow = formRows[0];

        return {
          formVersion: formRow === undefined ? null : toFormVersion(formRow),
          duplicate: false,
        };
      }

      const [formRows, duplicateRows] = await orm.batch([
        formQuery,
        orm
          .select({ id: registrationContacts.id })
          .from(registrationContacts)
          .where(duplicateCondition(orm, eventId, identity))
          .limit(1),
      ]);
      const formRow = formRows[0];

      return {
        formVersion: formRow === undefined ? null : toFormVersion(formRow),
        duplicate: duplicateRows.length > 0,
      };
    },

    async create(registration) {
      const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
        orm.insert(registrations).values({
          id: registration.id,
          eventId: registration.eventId,
          formVersion: registration.formVersion,
          manual: registration.manual,
          fullName: registration.fullName,
          fullNameNormalized: registration.fullNameNormalized,
          consentAt: registration.consentAt,
          metadataJson: registration.metadata,
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
              manual: registration.manual,
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

      if (!registration.manual && phoneClaims.size > 0) {
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
              valueJson: answer.value,
            })),
          ),
        );
      }

      await orm.batch(statements);
    },

    async listByEvent(eventId, limit) {
      const rows = await orm.query.registrations.findMany({
        where: { eventId },
        with: { contacts: true, tickets: true, answers: true },
        orderBy: { createdAt: "desc", id: "desc" },
        limit,
      });

      return rows.map((row) => toRegistration(row));
    },

    async listSummariesByEvent(eventId, limit) {
      const rows = await orm.query.registrations.findMany({
        where: { eventId },
        with: { contacts: true, tickets: true },
        orderBy: { createdAt: "desc", id: "desc" },
        limit,
      });

      return rows.map((row) => toRegistrationSummary(row));
    },

    async searchByEvent(eventId, options) {
      const query = (options.query ?? "").trim().toLowerCase();
      const filters: SQL[] = [eq(registrations.eventId, eventId)];

      if (query.length > 0) {
        const phoneDigits = phoneSearchDigits(query);
        const ftsQuery = phoneDigits === null ? fullTextSearchQuery(query) : null;
        let textCondition: SQL | undefined;

        if (phoneDigits === null) {
          if (ftsQuery !== null) {
            textCondition = sql`${registrations.id} IN (
              SELECT registration_id FROM registration_search
              WHERE registration_search MATCH ${ftsQuery}
                AND event_id = ${eventId}
            )`;
          }
        } else {
          textCondition = sql`EXISTS (
            SELECT 1 FROM ${registrationContacts}
            WHERE ${registrationContacts.registrationId} = ${registrations.id}
              AND ${registrationContacts.kind} = ${CONTACT_KIND.phone}
              AND replace(${registrationContacts.phoneNormalized}, '+', '') LIKE ${`%${phoneDigits}%`}
          )`;
        }

        const searchCondition = or(eq(registrations.id, query), textCondition);

        if (searchCondition !== undefined) {
          filters.push(searchCondition);
        }
      }

      const paidCondition = (): SQL => {
        // Mirror isRegistrationPaid: a zero total is paid with no payment row.
        const amountDue = sql<number>`(
          SELECT COALESCE(SUM(${registrationTickets.quantity} * ${registrationTickets.unitPriceMinor}), 0)
          FROM ${registrationTickets}
          WHERE ${registrationTickets.registrationId} = ${registrations.id}
        )`;

        return (
          or(
            eq(amountDue, 0),
            exists(
              orm
                .select({ id: payments.id })
                .from(payments)
                .where(
                  and(
                    eq(payments.registrationId, registrations.id),
                    gte(payments.amountMinor, amountDue),
                  ),
                ),
            ),
          ) ?? sql`0 = 1`
        );
      };

      if (options.payment === "paid") {
        filters.push(paidCondition());
      } else if (options.payment === "unpaid") {
        filters.push(not(paidCondition()));
      }

      const checkedInCondition = (): SQL =>
        exists(
          orm
            .select({ id: checkins.id })
            .from(checkins)
            .where(eq(checkins.registrationId, registrations.id)),
        );

      if (options.checkin === "checked_in") {
        filters.push(checkedInCondition());
      } else if (options.checkin === "not_checked_in") {
        filters.push(not(checkedInCondition()));
      }

      const cursor = options.after ?? options.before ?? null;
      const backwards = options.before !== undefined;

      if (cursor !== null) {
        const comparison = backwards ? sql`>` : sql`<`;
        filters.push(
          sql`(${registrations.createdAt}, ${registrations.id}) ${comparison} (${cursor.createdAt}, ${cursor.id})`,
        );
      }

      const where = and(...filters);
      // Fetch one extra row to detect another page without counting (and
      // scanning) every matching row.
      const page = await orm
        .select({ id: registrations.id, createdAt: registrations.createdAt })
        .from(registrations)
        .where(where)
        .orderBy(
          ...(backwards
            ? [asc(registrations.createdAt), asc(registrations.id)]
            : [desc(registrations.createdAt), desc(registrations.id)]),
        )
        .limit(options.limit + 1)
        .all();
      const hasMore = page.length > options.limit;
      const pageRows = hasMore ? page.slice(0, options.limit) : page;

      if (backwards) {
        pageRows.reverse();
      }

      const ids = pageRows.map((row) => row.id);

      if (ids.length === 0) {
        return {
          registrations: [],
          hasNext: false,
          hasPrev: false,
          nextCursor: null,
          prevCursor: null,
        };
      }

      const rows = await orm.query.registrations.findMany({
        where: { id: { in: ids } },
        with: { contacts: true, tickets: true },
      });
      const rowsById = new Map(rows.map((row) => [row.id, row]));
      const first = pageRows[0];
      const last = pageRows.at(-1);

      return {
        registrations: ids.flatMap((id) => {
          const row = rowsById.get(id);

          return row === undefined ? [] : [toRegistrationSummary(row)];
        }),
        hasNext: backwards || hasMore,
        hasPrev: backwards ? hasMore : cursor !== null,
        nextCursor: last === undefined ? null : toRegistrationCursor(last),
        prevCursor: first === undefined ? null : toRegistrationCursor(first),
      };
    },

    async findById(eventId, id) {
      const row = await orm.query.registrations.findFirst({
        where: { eventId, id },
        with: { contacts: true, tickets: true, answers: true },
      });

      return row === undefined ? null : toRegistration(row);
    },
  };
}

export const getRegistrationRepository = databaseSingleton(createRegistrationRepository);
