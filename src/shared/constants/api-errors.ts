/** Shared API error codes for event-engine routes. */
export const API_ERROR = {
  invalidEventId: "invalid_event_id",
  invalidRegistrationId: "invalid_registration_id",
  invalidEventSlug: "invalid_event_slug",
  invalidPayload: "invalid_payload",
  eventNotFound: "event_not_found",
  registrationNotFound: "registration_not_found",
  forbidden: "forbidden",
  eventExists: "event_exists",
  ticketTypeExists: "ticket_type_exists",
  paymentRequired: "payment_required",
} as const;
