// @boundary shared
/** Registration API contract and submission-source constants. */

export const REGISTRATION_SOURCE = "events-web";

export const REGISTRATION_TURNSTILE_ACTION = "event-registration";

export const REGISTRATION_ERROR = {
  duplicate: "event_duplicate_registration",
  ticketLimit: "event_ticket_limit_reached",
  ticketTypeCapacity: "event_ticket_type_capacity_reached",
  eventCapacity: "event_capacity_reached",
  registrationClosed: "event_registration_closed",
  eventUnavailable: "event_unavailable",
  invalidPayload: "event_invalid_payload",
  rateLimited: "rate_limited",
  turnstileRequired: "turnstile_required",
  turnstileFailed: "turnstile_failed",
  turnstileUnavailable: "turnstile_unavailable",
} as const;
