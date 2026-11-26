// @boundary server
import { type } from "arktype";

/** Position of a registration row in (createdAt, id) descending order. */
export const registrationCursorSchema = type({
  createdAt: "string",
  id: "string.uuid.v7",
});

export type RegistrationCursor = typeof registrationCursorSchema.infer;
