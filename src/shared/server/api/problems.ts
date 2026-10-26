import { API_ERROR } from "~/shared/constants/api-errors";

export interface ApiProblem {
  readonly status: number;
  readonly error: string;
}

/** Shared status/error definitions for direct responses and Effect failures. */
export const API_PROBLEM = {
  invalidEventId: { status: 400, error: API_ERROR.invalidEventId },
  invalidRegistrationId: { status: 400, error: API_ERROR.invalidRegistrationId },
  invalidEventSlug: { status: 400, error: API_ERROR.invalidEventSlug },
  invalidPayload: { status: 400, error: API_ERROR.invalidPayload },
  eventNotFound: { status: 404, error: API_ERROR.eventNotFound },
  registrationNotFound: { status: 404, error: API_ERROR.registrationNotFound },
  forbidden: { status: 403, error: API_ERROR.forbidden },
  paymentRequired: { status: 409, error: API_ERROR.paymentRequired },
  paymentUpdateFailed: { status: 500, error: "payment_update_failed" },
  checkinFailed: { status: 500, error: "checkin_failed" },
} as const satisfies Record<string, ApiProblem>;
