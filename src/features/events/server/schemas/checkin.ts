// @boundary server
import { type } from "arktype";

import { uuidV7Schema } from "~/features/events/domain/schemas/common";

export const checkinCreateSchema = type({
  registrationId: uuidV7Schema,
});
