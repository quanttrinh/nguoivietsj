// @boundary shared
import { type } from "arktype";

import { LIMITS } from "../limits";
import { STATUS_OTP_CODE_LENGTH, STATUS_TOKEN_REGEX } from "../status";
import { patternStringSchema, uuidV7Schema } from "./common";

export const statusRequestBodySchema = type({
  registrationId: uuidV7Schema,
  email: type(`1 <= string.email <= ${LIMITS.text.email}`),
});
export type StatusRequestInput = typeof statusRequestBodySchema.infer;

export const statusVerifyBodySchema = type({
  registrationId: uuidV7Schema,
  code: type(`string.digits == ${STATUS_OTP_CODE_LENGTH}`),
});
export type StatusVerifyInput = typeof statusVerifyBodySchema.infer;

export const statusTokenParamSchema = type({
  token: patternStringSchema(STATUS_TOKEN_REGEX, 100, 20),
});
export type StatusTokenParam = typeof statusTokenParamSchema.infer;
