/* oxlint-disable eslint/max-params -- Registration helpers take explicit input/error context. */

import { Data, Effect } from "effect";

import type { EngineDb } from "~/db/events";
import { classifyDatabaseError, DATABASE_ERROR, type DatabaseError } from "~/db/events/errors";
import { CONTACT_KIND, EVENT_STATUS, FORM_VERSION_STATUS } from "~/events/domain/constants";
import { validateRegistrationForm } from "~/events/domain/form-schema";
import type { FormSchema, RegistrationFormIssue } from "~/events/domain/form-schema/types";
import {
  MAX_ANSWER_BYTES,
  MAX_CONTACT_VALUE_BYTES,
  MAX_METADATA_BYTES,
} from "~/events/domain/limits";
import {
  normalizeCountry,
  normalizeEmail,
  normalizeFullName,
  normalizePhone,
  normalizePostalCode,
  normalizeProvince,
} from "~/events/domain/normalize";
import type {
  ContactInput,
  EventDetail,
  PreparedAnswer,
  PreparedContact,
  PreparedRegistration,
  PreparedTicket,
  RegistrationError,
  RegistrationInput,
  RegistrationResult,
} from "~/events/domain/types";
import { jsonByteLength } from "~/events/server/http";
import { makeStatusToken } from "~/events/server/status";
import { FORM_KEY_REGEX, FULL_NAME_REGEX } from "~/shared/constants/patterns";
import { newId } from "~/shared/utils/uuid";

const RESERVED_FIELD_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Typed failure used by the server-side Effect pilot. */
export class RegistrationFailure extends Data.TaggedError("RegistrationFailure")<{
  readonly error: RegistrationError;
}> {}

function registrationError(
  status: number,
  error: string,
  fields?: string[],
  issues?: RegistrationFormIssue[],
): RegistrationError {
  return {
    status,
    error,
    ...(fields === undefined ? {} : { fields }),
    ...(issues === undefined ? {} : { issues }),
  };
}

function isRegistrationError(value: unknown): value is RegistrationError {
  return typeof value === "object" && value !== null && "status" in value && "error" in value;
}

function attempt<T>(value: T | RegistrationError): Effect.Effect<T, RegistrationFailure> {
  return isRegistrationError(value)
    ? Effect.fail(new RegistrationFailure({ error: value }))
    : Effect.succeed(value);
}

function ensure(
  condition: boolean,
  error: RegistrationError,
): Effect.Effect<void, RegistrationFailure> {
  return condition ? Effect.void : Effect.fail(new RegistrationFailure({ error }));
}

function normalizeContact(
  input: ContactInput,
  isPrimary: boolean,
): PreparedContact | RegistrationError {
  const id = newId();
  const label = input.label?.trim() ?? null;
  const value = input.value ?? {};

  if (jsonByteLength(value) > MAX_CONTACT_VALUE_BYTES) {
    return { status: 400, error: "invalid_payload", fields: ["contacts"] };
  }

  const base = {
    id,
    label,
    isPrimary,
    isConfirmation: input.isConfirmation,
    email: null,
    emailNormalized: null,
    phone: null,
    phoneNormalized: null,
    addressLine1: null,
    addressLine2: null,
    city: null,
    province: null,
    postalCode: null,
    country: null,
    value,
  };

  if (input.kind === CONTACT_KIND.email) {
    const email = input.email?.trim() ?? "";

    return {
      ...base,
      kind: CONTACT_KIND.email,
      email,
      emailNormalized: normalizeEmail(email),
    };
  }

  if (input.kind === CONTACT_KIND.phone) {
    const phone = input.phone?.trim() ?? "";

    return {
      ...base,
      kind: CONTACT_KIND.phone,
      phone,
      phoneNormalized: normalizePhone(phone),
    };
  }

  return {
    ...base,
    kind: CONTACT_KIND.mail,
    addressLine1: input.addressLine1?.trim() ?? "",
    addressLine2: input.addressLine2?.trim() ?? null,
    city: input.city?.trim() ?? "",
    province: normalizeProvince(input.province ?? ""),
    postalCode: normalizePostalCode(input.postalCode ?? ""),
    country: normalizeCountry(input.country ?? "CA"),
  };
}

function registrationErrorFromDatabase(error: DatabaseError): RegistrationError {
  switch (error.code) {
    case DATABASE_ERROR.duplicateRegistration: {
      return registrationError(409, "duplicate_registration");
    }
    case DATABASE_ERROR.eventCapacityReached: {
      return registrationError(409, "event_capacity_reached");
    }
    case DATABASE_ERROR.ticketTypeCapacityReached: {
      return registrationError(409, "ticket_type_capacity_reached");
    }
    case DATABASE_ERROR.ticketLimitReached: {
      return registrationError(409, "ticket_limit_reached");
    }
    case DATABASE_ERROR.ticketTypeUnavailable: {
      return registrationError(409, "ticket_type_unavailable");
    }
    case DATABASE_ERROR.invalidFormVersion: {
      return registrationError(400, "invalid_form_version");
    }
    case DATABASE_ERROR.invalidPayload:
    case DATABASE_ERROR.foreignKey: {
      return registrationError(400, "invalid_payload");
    }
    case DATABASE_ERROR.eventConflict:
    case DATABASE_ERROR.uniqueConstraint:
    case DATABASE_ERROR.unknown: {
      return registrationError(500, "registration_failed");
    }
    default: {
      return registrationError(500, "registration_failed");
    }
  }
}

function prepareTickets(
  event: EventDetail,
  input: RegistrationInput,
): { tickets: PreparedTicket[]; total: number; amountMinor: number } | RegistrationError {
  const activeTypes = event.ticketTypes.filter((type) => type.active);
  const byKey = new Map(activeTypes.map((type) => [type.key, type]));
  const selected = new Map<string, number>();

  for (const selection of input.tickets) {
    if (selection.quantity !== 0) {
      if (selected.has(selection.key)) {
        return { status: 400, error: "invalid_payload", fields: ["tickets"] };
      }

      if (!byKey.has(selection.key)) {
        return { status: 409, error: "ticket_type_unavailable" };
      }

      selected.set(selection.key, selection.quantity);
    }
  }

  if (selected.size === 0) {
    return { status: 400, error: "invalid_payload", fields: ["tickets"] };
  }

  let total = 0;
  let amountMinor = 0;
  const tickets: PreparedTicket[] = [];

  for (const type of activeTypes) {
    const quantity = selected.get(type.key) ?? 0;

    if (quantity < type.minPerRegistration) {
      return { status: 409, error: "ticket_limit_reached" };
    }

    if (quantity > 0) {
      if (type.maxPerRegistration !== null && quantity > type.maxPerRegistration) {
        return { status: 409, error: "ticket_limit_reached" };
      }

      if (type.capacity !== null && type.ticketsSold + quantity > type.capacity) {
        return { status: 409, error: "ticket_type_capacity_reached" };
      }

      total += quantity;
      amountMinor += quantity * type.priceMinor;
      tickets.push({
        key: type.key,
        quantity,
        unitPriceMinor: type.priceMinor,
        currency: event.limits.currency,
        label: type.label,
      });
    }
  }

  const combinedLimit = event.limits.maxTicketsPerRegistration;

  if (combinedLimit !== null && total > combinedLimit) {
    return { status: 409, error: "ticket_limit_reached" };
  }

  const eventLimit = event.limits.maxTotalTickets;

  if (eventLimit !== null && event.ticketsTotal + total > eventLimit) {
    return { status: 409, error: "event_capacity_reached" };
  }

  return { tickets, total, amountMinor };
}

function prepareAnswers(input: RegistrationInput): PreparedAnswer[] | RegistrationError {
  const entries = Object.entries(input.answers);

  if (entries.length === 0) {
    return [];
  }

  if (input.formVersion === null) {
    return { status: 400, error: "invalid_payload", fields: ["answers"] };
  }

  const answers: PreparedAnswer[] = [];

  for (const [fieldKey, value] of entries) {
    if (
      !FORM_KEY_REGEX.test(fieldKey) ||
      RESERVED_FIELD_KEYS.has(fieldKey) ||
      jsonByteLength(value) > MAX_ANSWER_BYTES
    ) {
      return { status: 400, error: "invalid_payload", fields: ["answers"] };
    }

    answers.push({ fieldKey, valueJson: JSON.stringify(value) });
  }

  return answers;
}

export interface CreateRegistrationInput {
  db: EngineDb;
  event: EventDetail;
  registration: RegistrationInput;
  enforceRegistrationOpen: boolean;
}

export function createRegistration({
  db,
  event,
  registration,
  enforceRegistrationOpen,
}: CreateRegistrationInput): Effect.Effect<RegistrationResult, RegistrationFailure> {
  return Effect.gen(function* createRegistrationProgram() {
    yield* ensure(
      !enforceRegistrationOpen || event.registrationOpen,
      registrationError(409, "registration_closed"),
    );

    yield* ensure(
      event.status === EVENT_STATUS.upcoming || event.status === EVENT_STATUS.active,
      registrationError(409, "event_unavailable"),
    );

    const ticketResult = yield* attempt(prepareTickets(event, registration));
    const fullName = registration.fullName.trim();

    yield* ensure(
      FULL_NAME_REGEX.test(fullName),
      registrationError(400, "invalid_payload", ["fullName"]),
    );

    const confirmationContacts = registration.contacts.filter((contact) => contact.isConfirmation);
    const primaryContacts = registration.contacts.filter((contact) => contact.isPrimary);

    yield* ensure(
      confirmationContacts.length <= 1,
      registrationError(400, "invalid_payload", ["contacts"]),
    );
    yield* ensure(
      primaryContacts.length <= 1,
      registrationError(400, "invalid_payload", ["contacts"]),
    );

    const confirmation = confirmationContacts[0];
    const confirmationIndex =
      confirmation === undefined ? -1 : registration.contacts.indexOf(confirmation);
    const defaultPrimaryIndex = Math.max(confirmationIndex, 0);
    const normalizedContacts: PreparedContact[] = [];

    for (const [index, contact] of registration.contacts.entries()) {
      const isPrimary =
        primaryContacts.length > 0 ? contact.isPrimary : index === defaultPrimaryIndex;
      const normalized = yield* attempt(normalizeContact(contact, isPrimary));

      normalizedContacts.push(normalized);
    }

    const fullNameNormalized = normalizeFullName(fullName);
    const emails = normalizedContacts
      .map((contact) => contact.emailNormalized)
      .filter((value): value is string => value !== null);
    const phones = normalizedContacts
      .map((contact) => contact.phoneNormalized)
      .filter((value): value is string => value !== null);

    // The form-version lookup and duplicate check are independent reads.
    // One D1 batch call saves a round trip on the hot registration path.
    const context = yield* Effect.promise(() =>
      db.registrations.findCreateContext(event.id, registration.formVersion, {
        emails,
        phones,
        fullNameNormalized,
      }),
    );
    const storedFormVersion = context.formVersion;

    yield* ensure(
      registration.formVersion === null ||
        storedFormVersion?.status === FORM_VERSION_STATUS.published,
      registrationError(400, "invalid_form_version"),
    );

    const formVersion = storedFormVersion?.version ?? registration.formVersion;
    let answersInput = registration.answers;

    if (storedFormVersion !== null) {
      const formValidation = validateRegistrationForm(
        storedFormVersion.schema as unknown as FormSchema,
        registration,
      );

      yield* ensure(
        formValidation.issues.length === 0,
        registrationError(400, "invalid_payload", ["answers"], formValidation.issues),
      );

      answersInput = formValidation.answers;
    }

    yield* ensure(!context.duplicate, registrationError(409, "duplicate_registration"));

    const answers = yield* attempt(prepareAnswers({ ...registration, answers: answersInput }));

    yield* ensure(
      jsonByteLength(registration.metadata) <= MAX_METADATA_BYTES,
      registrationError(400, "invalid_payload", ["metadata"]),
    );

    const statusToken = yield* Effect.promise(() => makeStatusToken());
    const prepared: PreparedRegistration = {
      id: newId(),
      eventId: event.id,
      statusTokenHash: statusToken.hash,
      statusTokenExpiresAt: statusToken.expiresAt,
      formVersion,
      fullName,
      fullNameNormalized,
      consentAt: new Date().toISOString(),
      metadataJson: JSON.stringify(registration.metadata),
      contacts: normalizedContacts,
      tickets: ticketResult.tickets,
      answers,
    };

    yield* Effect.tryPromise({
      try: () => db.registrations.create(prepared),
      catch: (error) => {
        console.error("Failed to create event-engine registration", error);
        return new RegistrationFailure({
          error: registrationErrorFromDatabase(classifyDatabaseError(error)),
        });
      },
    });

    return {
      id: prepared.id,
      eventId: event.id,
      amountMinor: ticketResult.amountMinor,
      ticketsTotal: ticketResult.total,
      statusToken: statusToken.token,
    };
  });
}
