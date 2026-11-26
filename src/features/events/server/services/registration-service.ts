// @boundary server

import { type as ark } from "arktype";

import {
  CONTACT_KIND,
  EVENT_STATUS,
  FORM_VERSION_STATUS,
} from "~/features/events/domain/constants";
import { validateRegistrationForm } from "~/features/events/domain/form-schema";
import { formSchemaSchema } from "~/features/events/domain/form-schema/schema/schema";
import type { RegistrationFormIssue } from "~/features/events/domain/form-schema/types";
import { LIMITS } from "~/features/events/domain/limits";
import { FORM_KEY_REGEX, FULL_NAME_REGEX } from "~/features/events/domain/patterns";
import { patternStringSchema, unknownRecordSchema } from "~/features/events/domain/schemas/common";
import type {
  ContactInput,
  EventDetail,
  PreparedAnswer,
  PreparedContact,
  PreparedRegistration,
  RegistrationInput,
  RegistrationResult,
  RegistrationTicketRecord,
  TicketSelection,
  TicketTypeRecord,
} from "~/features/events/domain/types";
import {
  normalizeEmail,
  normalizeUppercaseCode,
  normalizeFullName,
  normalizePhone,
} from "~/features/events/server/normalize";
import {
  contactSchema,
  type ManualRegistrationInput,
} from "~/features/events/server/schemas/registration";
import { makeStatusToken } from "~/features/events/server/services/status";
import {
  classifyDatabaseError,
  DATABASE_ERROR,
  type DatabaseError,
} from "~/platform/server/db/events/errors";
import type { RegistrationRepository } from "~/platform/server/db/events/registrations";
import { serverLogger } from "~/platform/server/logger";
import { TEXT_ENCODER } from "~/platform/utils/text-coding";
import { newId } from "~/platform/utils/uuid";

const RESERVED_FIELD_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const REGISTRATION_FAILURE = {
  registrationClosed: "event_registration_closed",
  eventUnavailable: "event_unavailable",
  duplicate: "event_duplicate_registration",
  eventCapacity: "event_capacity_reached",
  ticketTypeCapacity: "event_ticket_type_capacity_reached",
  ticketLimit: "event_ticket_limit_reached",
  ticketTypeUnavailable: "event_ticket_type_unavailable",
  invalidFormVersion: "event_invalid_form_version",
  invalidPayload: "event_invalid_payload",
  registrationFailed: "event_registration_failed",
} as const;

export type RegistrationFailureCode =
  (typeof REGISTRATION_FAILURE)[keyof typeof REGISTRATION_FAILURE];

export class RegistrationFailureError extends Error {
  readonly code: RegistrationFailureCode;
  readonly fields: string[] | undefined;
  readonly issues: RegistrationFormIssue[] | undefined;

  constructor(
    code: RegistrationFailureCode,
    options: { fields?: string[]; issues?: RegistrationFormIssue[] } = {},
  ) {
    super(code);
    this.name = "RegistrationFailureError";
    this.code = code;
    this.fields = options.fields;
    this.issues = options.issues;
  }
}

/** Byte length of a JSON-serialized value, used for D1 size limits. */
function jsonByteLength(value: unknown) {
  return TEXT_ENCODER.encode(JSON.stringify(value)).byteLength;
}

const fullNameSchema = patternStringSchema(FULL_NAME_REGEX, LIMITS.text.fullName);
const metadataSchema = unknownRecordSchema.narrow(
  (value) => jsonByteLength(value) <= LIMITS.registration.metadataBytes,
);
const serviceContactSchema = contactSchema.narrow(
  (contact) => jsonByteLength(contact.value) <= LIMITS.registration.contactValueBytes,
);
const serviceContactsSchema = serviceContactSchema
  .array()
  .atLeastLength(1)
  .atMostLength(LIMITS.registration.contacts)
  .narrow(
    (contacts) =>
      contacts.filter((contact) => contact.isPrimary).length <= 1 &&
      contacts.filter((contact) => contact.isConfirmation).length <= 1,
  );
const answerKeySchema = patternStringSchema(FORM_KEY_REGEX, LIMITS.text.jsonKey).narrow(
  (key) => !RESERVED_FIELD_KEYS.has(key),
);
const answerValuesSchema = ark.Record(
  answerKeySchema,
  ark("unknown").narrow((value) => jsonByteLength(value) <= LIMITS.registration.answerBytes),
);

function registrationFailureFromDatabase(error: DatabaseError): RegistrationFailureCode {
  switch (error.code) {
    case DATABASE_ERROR.duplicateRegistration: {
      return REGISTRATION_FAILURE.duplicate;
    }
    case DATABASE_ERROR.eventCapacityReached: {
      return REGISTRATION_FAILURE.eventCapacity;
    }
    case DATABASE_ERROR.ticketTypeCapacityReached: {
      return REGISTRATION_FAILURE.ticketTypeCapacity;
    }
    case DATABASE_ERROR.ticketLimitReached: {
      return REGISTRATION_FAILURE.ticketLimit;
    }
    case DATABASE_ERROR.ticketTypeUnavailable: {
      return REGISTRATION_FAILURE.ticketTypeUnavailable;
    }
    case DATABASE_ERROR.invalidFormVersion: {
      return REGISTRATION_FAILURE.invalidFormVersion;
    }
    case DATABASE_ERROR.invalidPayload:
    case DATABASE_ERROR.foreignKey: {
      return REGISTRATION_FAILURE.invalidPayload;
    }
    case DATABASE_ERROR.eventConflict:
    case DATABASE_ERROR.uniqueConstraint:
    case DATABASE_ERROR.unknown: {
      return REGISTRATION_FAILURE.registrationFailed;
    }
    default: {
      return REGISTRATION_FAILURE.registrationFailed;
    }
  }
}

/** Stable identity used to reject duplicate contacts. */
function contactIdentity(input: ContactInput) {
  if (input.kind === CONTACT_KIND.email) {
    return `email:${normalizeEmail(input.email.trim())}`;
  }

  if (input.kind === CONTACT_KIND.phone) {
    return `phone:${normalizePhone(input.phone.trim())}`;
  }

  return CONTACT_KIND.mail;
}

function normalizeContact(input: ContactInput, isPrimary: boolean): PreparedContact {
  const id = newId();
  const label = input.label?.trim() ?? null;
  const value = input.value;

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
    const email = input.email.trim();

    return {
      ...base,
      kind: CONTACT_KIND.email,
      email,
      emailNormalized: normalizeEmail(email),
    };
  }

  if (input.kind === CONTACT_KIND.phone) {
    const phone = input.phone.trim();

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
    addressLine1: input.addressLine1.trim(),
    addressLine2: input.addressLine2?.trim() ?? null,
    city: input.city.trim(),
    province: normalizeUppercaseCode(input.province),
    postalCode: normalizeUppercaseCode(input.postalCode),
    country: normalizeUppercaseCode(input.country),
  };
}

interface TicketPreparation {
  tickets: RegistrationTicketRecord[];
  total: number;
  amountMinor: number;
}

interface TicketLimitChecks {
  /** Per-type quantity and capacity checks, applied before a selection is totalled. */
  checkType: (type: TicketTypeRecord, quantity: number) => void;
  /** Aggregate per-registration and event capacity checks, applied once at the end. */
  checkTotal: (event: EventDetail, total: number) => void;
}

interface TicketPreparationOptions {
  /** Eligible ticket types: active-only publicly, all for staff-assisted registrations. */
  types: readonly TicketTypeRecord[];
  /** Error raised when a selected key is not eligible. */
  unavailableError: () => RegistrationFailureError;
  /** Public registrations must select at least one ticket. */
  requireSelection: boolean;
  /** Limit checks for this path; manual registrations skip all of them. */
  limits: TicketLimitChecks;
}

const REGISTERED_TICKET_LIMITS: TicketLimitChecks = {
  checkType(type, quantity) {
    if (quantity > 0 && quantity < type.minPerRegistration) {
      throw new RegistrationFailureError(REGISTRATION_FAILURE.ticketLimit);
    }

    if (quantity > 0) {
      if (type.maxPerRegistration !== null && quantity > type.maxPerRegistration) {
        throw new RegistrationFailureError(REGISTRATION_FAILURE.ticketLimit);
      }

      if (type.capacity !== null && type.ticketsSold + quantity > type.capacity) {
        throw new RegistrationFailureError(REGISTRATION_FAILURE.ticketTypeCapacity);
      }
    }
  },
  checkTotal(event, total) {
    const combinedLimit = event.limits.maxTicketsPerRegistration;

    if (combinedLimit !== null && total > combinedLimit) {
      throw new RegistrationFailureError(REGISTRATION_FAILURE.ticketLimit);
    }

    const eventLimit = event.limits.maxTotalTickets;

    if (eventLimit !== null && event.ticketsTotal + total > eventLimit) {
      throw new RegistrationFailureError(REGISTRATION_FAILURE.eventCapacity);
    }
  },
};

const UNLIMITED_TICKETS: TicketLimitChecks = {
  // Staff-assisted registrations intentionally bypass all quantity and capacity checks.
  checkType: () => undefined,
  checkTotal: () => undefined,
};

/**
 * Shared ticket selection/totalling for both registration paths. Each path
 * supplies its eligible ticket types, unavailable-key error, and limit checks
 * so error codes and enforcement stay path-specific.
 */
function prepareSelectedTickets(
  event: EventDetail,
  selections: readonly TicketSelection[],
  options: TicketPreparationOptions,
): TicketPreparation {
  const { limits, requireSelection, types, unavailableError } = options;
  const byKey = new Map(types.map((type) => [type.key, type]));
  const selected = new Map<string, number>();

  for (const selection of selections) {
    if (selection.quantity !== 0) {
      if (selected.has(selection.key)) {
        throw new RegistrationFailureError(REGISTRATION_FAILURE.invalidPayload, {
          fields: ["tickets"],
        });
      }

      if (!byKey.has(selection.key)) {
        throw unavailableError();
      }

      selected.set(selection.key, selection.quantity);
    }
  }

  if (requireSelection && selected.size === 0) {
    throw new RegistrationFailureError(REGISTRATION_FAILURE.invalidPayload, {
      fields: ["tickets"],
    });
  }

  let total = 0;
  let amountMinor = 0;
  const tickets: RegistrationTicketRecord[] = [];

  for (const type of types) {
    const quantity = selected.get(type.key) ?? 0;

    if (quantity > 0) {
      limits.checkType(type, quantity);

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

  limits.checkTotal(event, total);

  return { tickets, total, amountMinor };
}

function prepareTickets(event: EventDetail, input: RegistrationInput): TicketPreparation {
  return prepareSelectedTickets(event, input.tickets, {
    types: event.ticketTypes.filter((type) => type.active),
    unavailableError: () =>
      new RegistrationFailureError(REGISTRATION_FAILURE.ticketTypeUnavailable),
    requireSelection: true,
    limits: REGISTERED_TICKET_LIMITS,
  });
}

function prepareManualTickets(
  event: EventDetail,
  input: ManualRegistrationInput,
): TicketPreparation {
  return prepareSelectedTickets(event, input.tickets, {
    types: event.ticketTypes,
    unavailableError: () =>
      new RegistrationFailureError(REGISTRATION_FAILURE.invalidPayload, {
        fields: ["tickets"],
      }),
    requireSelection: false,
    limits: UNLIMITED_TICKETS,
  });
}

function prepareAnswers(input: {
  formVersion: number | null;
  answers: Record<string, unknown>;
}): PreparedAnswer[] {
  const entries = Object.entries(input.answers);

  if (entries.length === 0) {
    return [];
  }

  if (input.formVersion === null) {
    throw new RegistrationFailureError(REGISTRATION_FAILURE.invalidPayload, {
      fields: ["answers"],
    });
  }

  const validated = answerValuesSchema(input.answers);

  if (validated instanceof ark.errors) {
    throw new RegistrationFailureError(REGISTRATION_FAILURE.invalidPayload, {
      fields: ["answers"],
    });
  }

  return entries.map(([fieldKey, value]) => ({ fieldKey, value }));
}

export interface CreateRegistrationInput {
  registrations: RegistrationRepository;
  event: EventDetail;
  registration: RegistrationInput;
  enforceRegistrationOpen: boolean;
}

export async function createRegistration({
  registrations,
  event,
  registration,
  enforceRegistrationOpen,
}: CreateRegistrationInput): Promise<RegistrationResult> {
  if (enforceRegistrationOpen && !event.registrationOpen) {
    throw new RegistrationFailureError(REGISTRATION_FAILURE.registrationClosed);
  }

  if (event.status !== EVENT_STATUS.upcoming && event.status !== EVENT_STATUS.active) {
    throw new RegistrationFailureError(REGISTRATION_FAILURE.eventUnavailable);
  }

  // The route's sValidator already ran registrationSchema (including its
  // defaults). Only the narrower D1 byte-length checks below run again here.
  const fullName = registration.fullName.trim();
  const fullNameResult = fullNameSchema(fullName);

  if (fullNameResult instanceof ark.errors) {
    throw new RegistrationFailureError(REGISTRATION_FAILURE.invalidPayload, {
      fields: ["fullName"],
    });
  }

  const metadataResult = metadataSchema(registration.metadata);

  if (metadataResult instanceof ark.errors) {
    throw new RegistrationFailureError(REGISTRATION_FAILURE.invalidPayload, {
      fields: ["metadata"],
    });
  }

  const contactsResult = serviceContactsSchema(registration.contacts);

  if (contactsResult instanceof ark.errors) {
    throw new RegistrationFailureError(REGISTRATION_FAILURE.invalidPayload, {
      fields: ["contacts"],
    });
  }

  const ticketResult = prepareTickets(event, registration);

  const confirmation = contactsResult.find((contact) => contact.isConfirmation);
  const primaryContacts = contactsResult.filter((contact) => contact.isPrimary);
  const confirmationIndex = confirmation === undefined ? -1 : contactsResult.indexOf(confirmation);
  const defaultPrimaryIndex = Math.max(confirmationIndex, 0);
  const normalizedContacts: PreparedContact[] = [];

  for (const [index, contact] of contactsResult.entries()) {
    const isPrimary =
      primaryContacts.length > 0 ? contact.isPrimary : index === defaultPrimaryIndex;

    normalizedContacts.push(normalizeContact(contact, isPrimary));
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
  const context = await registrations.findCreateContext(event.id, registration.formVersion, {
    emails,
    phones,
    fullNameNormalized,
  });
  const storedFormVersion = context.formVersion;

  if (storedFormVersion === null) {
    throw new RegistrationFailureError(REGISTRATION_FAILURE.eventUnavailable);
  }

  if (storedFormVersion.status !== FORM_VERSION_STATUS.published) {
    throw new RegistrationFailureError(REGISTRATION_FAILURE.invalidFormVersion);
  }

  const formVersion = storedFormVersion.version;
  const schema = formSchemaSchema(storedFormVersion.schema);

  if (schema instanceof ark.errors) {
    throw new RegistrationFailureError(REGISTRATION_FAILURE.invalidFormVersion);
  }

  const formValidation = validateRegistrationForm(schema, registration);

  if (formValidation.issues.length > 0) {
    throw new RegistrationFailureError(REGISTRATION_FAILURE.invalidPayload, {
      fields: ["answers"],
      issues: formValidation.issues,
    });
  }

  if (context.duplicate) {
    throw new RegistrationFailureError(REGISTRATION_FAILURE.duplicate);
  }

  const answers = prepareAnswers({
    ...registration,
    answers: formValidation.answers,
  });

  const statusToken = await makeStatusToken();
  const prepared: PreparedRegistration = {
    id: newId(),
    eventId: event.id,
    statusTokenHash: statusToken.hash,
    statusTokenExpiresAt: statusToken.expiresAt,
    formVersion,
    manual: false,
    fullName,
    fullNameNormalized,
    consentAt: new Date().toISOString(),
    metadata: registration.metadata,
    contacts: normalizedContacts,
    tickets: ticketResult.tickets,
    answers,
  };

  try {
    await registrations.create(prepared);
  } catch (error) {
    const classified = classifyDatabaseError(error);

    serverLogger.error(
      {
        code: classified.code,
        name: error instanceof Error ? error.name : typeof error,
      },
      "Failed to create event-engine registration",
    );

    throw new RegistrationFailureError(registrationFailureFromDatabase(classified));
  }

  return {
    id: prepared.id,
    eventId: event.id,
    amountMinor: ticketResult.amountMinor,
    ticketsTotal: ticketResult.total,
    statusToken: statusToken.token,
  };
}

export interface CreateManualRegistrationInput {
  registrations: RegistrationRepository;
  event: EventDetail;
  registration: ManualRegistrationInput;
}

/**
 * Create a staff-assisted registration without enforcing registration-window,
 * event-status, duplicate, capacity, form-version, or form-answer checks.
 *
 * Structural validation still applies so persisted rows keep their required
 * shapes. Database capacity guards also skip registrations marked as manual.
 */
export async function createManualRegistration({
  registrations,
  event,
  registration,
}: CreateManualRegistrationInput): Promise<RegistrationResult> {
  // The route's sValidator already ran manualRegistrationSchema (including
  // its defaults). Only the narrower checks below run again here.
  const fullName = registration.fullName.trim();
  const fullNameResult = fullNameSchema(fullName);

  if (fullNameResult instanceof ark.errors) {
    throw new RegistrationFailureError(REGISTRATION_FAILURE.invalidPayload, {
      fields: ["fullName"],
    });
  }

  const metadataResult = metadataSchema(registration.metadata);

  if (metadataResult instanceof ark.errors) {
    throw new RegistrationFailureError(REGISTRATION_FAILURE.invalidPayload, {
      fields: ["metadata"],
    });
  }

  const contactsResult = registration.contacts;

  if (contactsResult.length > 1) {
    const primaryCount = contactsResult.filter((contact) => contact.isPrimary).length;
    const confirmationCount = contactsResult.filter((contact) => contact.isConfirmation).length;
    // Reject duplicates the database treats as unique; distinct numbers and
    // emails of the same kind remain valid.
    const identities = new Set<string>();
    const duplicateContact = contactsResult.some((contact) => {
      const identity = contactIdentity(contact);

      if (identities.has(identity)) {
        return true;
      }

      identities.add(identity);
      return false;
    });

    if (primaryCount > 1 || confirmationCount > 1 || duplicateContact) {
      throw new RegistrationFailureError(REGISTRATION_FAILURE.invalidPayload, {
        fields: ["contacts"],
      });
    }
  }

  const ticketResult = prepareManualTickets(event, registration);
  const answers = prepareAnswers({
    formVersion: registration.formVersion,
    answers: registration.answers,
  });
  const normalizedContacts: PreparedContact[] = [];
  const hasPrimary = contactsResult.some((contact) => contact.isPrimary);

  for (const [index, contact] of contactsResult.entries()) {
    normalizedContacts.push(
      normalizeContact(contact, hasPrimary ? contact.isPrimary : index === 0),
    );
  }

  const fullNameNormalized = normalizeFullName(fullName);
  const statusToken = await makeStatusToken();
  const prepared: PreparedRegistration = {
    id: newId(),
    eventId: event.id,
    statusTokenHash: statusToken.hash,
    statusTokenExpiresAt: statusToken.expiresAt,
    formVersion: registration.formVersion,
    manual: true,
    fullName,
    fullNameNormalized,
    consentAt: new Date().toISOString(),
    metadata: { ...registration.metadata, manual: true },
    contacts: normalizedContacts,
    tickets: ticketResult.tickets,
    answers,
  };

  try {
    await registrations.create(prepared);
  } catch (error) {
    const classified = classifyDatabaseError(error);

    serverLogger.error(
      {
        code: classified.code,
        name: error instanceof Error ? error.name : typeof error,
      },
      "Failed to create manual event-engine registration",
    );

    throw new RegistrationFailureError(registrationFailureFromDatabase(classified));
  }

  return {
    id: prepared.id,
    eventId: event.id,
    amountMinor: ticketResult.amountMinor,
    ticketsTotal: ticketResult.total,
    statusToken: statusToken.token,
  };
}
