// @boundary server
import { type } from "arktype";

import { emailSchema, uuidV7Schema } from "~/features/events/domain/schemas/common";
import { STATUS_OTP_CODE_LENGTH } from "~/features/events/domain/status";

export const statusRequestBodySchema = type({
  registrationId: uuidV7Schema,
  email: emailSchema,
});

export const statusVerifyBodySchema = type({
  registrationId: uuidV7Schema,
  code: type(`string.digits == ${STATUS_OTP_CODE_LENGTH}`),
});
