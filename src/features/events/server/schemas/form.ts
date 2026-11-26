// @boundary server
import { type } from "arktype";

import { LIMITS } from "~/features/events/domain/limits";
import { unknownRecordSchema } from "~/features/events/domain/schemas/common";

export const formVersionCreateSchema = type({
  version: type(`1 <= number.integer <= ${LIMITS.registration.maxFormVersion}`),
  schema: unknownRecordSchema,
  status: type("'draft' | 'published'"),
});
export type FormVersionInput = typeof formVersionCreateSchema.infer;
