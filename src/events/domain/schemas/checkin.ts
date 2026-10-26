// @boundary shared
import { type } from "arktype";

import { uuidV7Schema } from "./common";

export const checkinCreateSchema = type({
  registrationId: uuidV7Schema,
});
export type CheckinCreateInput = typeof checkinCreateSchema.infer;
