// @boundary shared
import { type } from "arktype";

import { LIMITS } from "../limits";
import { STATUS_OTP_CODE_LENGTH } from "../status";
import { uuidV7Schema } from "./common";

export const statusRequestBodySchema = type({
  registrationId: uuidV7Schema,
  email: type(`1 <= string.email <= ${LIMITS.text.email}`),
});

export const statusVerifyBodySchema = type({
  registrationId: uuidV7Schema,
  code: type(`string.digits == ${STATUS_OTP_CODE_LENGTH}`),
});
