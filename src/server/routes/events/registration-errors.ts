// @boundary server
/* oxlint-disable typescript/explicit-function-return-type, typescript/explicit-module-boundary-types -- response types stay inferred for Hono RPC. */
import type { Context } from "hono";

import type {
  RegistrationFailureError,
  RegistrationFailureCode,
} from "~/events/services/registration-service";
import { apiError } from "~/server/api-response";

const STATUS_BY_CODE: Record<RegistrationFailureCode, 400 | 409 | 500> = {
  event_registration_closed: 409,
  event_unavailable: 409,
  event_duplicate_registration: 409,
  event_capacity_reached: 409,
  event_ticket_type_capacity_reached: 409,
  event_ticket_limit_reached: 409,
  event_ticket_type_unavailable: 409,
  event_invalid_form_version: 400,
  event_invalid_payload: 400,
  event_registration_failed: 500,
};

export function registrationFailureResponse(ctx: Context, failure: RegistrationFailureError) {
  return apiError(ctx, failure.code, {
    status: STATUS_BY_CODE[failure.code],
    ...(failure.fields === undefined ? {} : { fields: failure.fields }),
    ...(failure.issues === undefined ? {} : { issues: failure.issues }),
  });
}
