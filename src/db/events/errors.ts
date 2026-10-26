function messageOf(error: unknown): string {
  const messages: string[] = [];
  let current: unknown = error;

  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    messages.push(current.message);
    current = current.cause;
  }

  return messages.length > 0 ? messages.join(" | ") : String(error);
}

/** Stable database error codes understood by the service layer. */
export const DATABASE_ERROR = {
  duplicateRegistration: "duplicate_registration",
  eventCapacityReached: "event_capacity_reached",
  ticketTypeCapacityReached: "ticket_type_capacity_reached",
  ticketLimitReached: "ticket_limit_reached",
  ticketTypeUnavailable: "ticket_type_unavailable",
  invalidFormVersion: "invalid_form_version",
  invalidPayload: "invalid_payload",
  eventConflict: "event_conflict",
  uniqueConstraint: "unique_constraint",
  foreignKey: "foreign_key",
  unknown: "unknown",
} as const;

export type DatabaseErrorCode = (typeof DATABASE_ERROR)[keyof typeof DATABASE_ERROR];

/** A D1/Drizzle failure translated into a domain-agnostic database code. */
export class DatabaseError extends Error {
  public readonly code: DatabaseErrorCode;

  public constructor(code: DatabaseErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DatabaseError";
    this.code = code;
  }
}

/**
 * Classify raw D1/Drizzle errors once at the database boundary.
 *
 * D1 exposes trigger and constraint failures as message strings, so the string
 * matching has to live somewhere. Keeping it here prevents services from
 * knowing about D1's wording.
 */
export function classifyDatabaseError(error: unknown): DatabaseError {
  if (error instanceof DatabaseError) {
    return error;
  }

  const message = messageOf(error);
  let code: DatabaseErrorCode = DATABASE_ERROR.unknown;

  if (
    message.includes("duplicate_registration") ||
    message.includes("UNIQUE constraint failed: registration_contacts.event_id") ||
    message.includes("UNIQUE constraint failed: registration_phone_claims")
  ) {
    code = DATABASE_ERROR.duplicateRegistration;
  } else if (message.includes("event_capacity_reached")) {
    code = DATABASE_ERROR.eventCapacityReached;
  } else if (message.includes("ticket_type_capacity_reached")) {
    code = DATABASE_ERROR.ticketTypeCapacityReached;
  } else if (
    message.includes("ticket_limit_reached") ||
    message.includes("ticket_type_limit_reached")
  ) {
    code = DATABASE_ERROR.ticketLimitReached;
  } else if (message.includes("ticket_type_unavailable")) {
    code = DATABASE_ERROR.ticketTypeUnavailable;
  } else if (message.includes("invalid_form_version")) {
    code = DATABASE_ERROR.invalidFormVersion;
  } else if (
    message.includes("answer_scope_mismatch") ||
    message.includes("contact_scope_mismatch") ||
    message.includes("ticket_scope_mismatch")
  ) {
    code = DATABASE_ERROR.invalidPayload;
  } else if (message.includes("FOREIGN KEY constraint failed")) {
    code = DATABASE_ERROR.foreignKey;
  } else if (
    message.includes("alias_conflicts_with_slug") ||
    message.includes("slug_conflicts_with_alias")
  ) {
    code = DATABASE_ERROR.eventConflict;
  } else if (message.includes("UNIQUE constraint failed")) {
    code = DATABASE_ERROR.uniqueConstraint;
  }

  return new DatabaseError(code, message, { cause: error });
}
