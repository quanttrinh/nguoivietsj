// @boundary shared
import { type } from "arktype";

import { LIMITS } from "../limits";
import { unknownRecordSchema } from "./common";

export const formVersionCreateSchema = type({
  version: type(`1 <= number.integer <= ${LIMITS.registration.maxFormVersion}`),
  schema: unknownRecordSchema,
  status: type("'draft' | 'published'"),
});
export type FormVersionInput = typeof formVersionCreateSchema.infer;
