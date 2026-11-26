// @boundary server
import { type } from "arktype";

import { LIMITS } from "~/features/events/domain/limits";
import { uuidV7Schema } from "~/features/events/domain/schemas/common";
import { STATUS_OTP_CODE_LENGTH } from "~/features/events/domain/status";

export const statusRequestBodySchema = type({
  registrationId: uuidV7Schema,
  email: type(`1 <= string.email <= ${LIMITS.text.email}`),
});

export const statusVerifyBodySchema = type({
  registrationId: uuidV7Schema,
  code: type(`string.digits == ${STATUS_OTP_CODE_LENGTH}`),
});
