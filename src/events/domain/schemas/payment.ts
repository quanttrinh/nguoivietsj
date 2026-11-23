// @boundary shared
import { type } from "arktype";

import { PAYMENT_METHOD } from "../constants";
import { LIMITS } from "../limits";

const nullableNoteSchema = type(`string <= ${LIMITS.payment.note} | null`);

export const paymentSchema = type({
  method: type.valueOf(PAYMENT_METHOD),
  "note?": nullableNoteSchema,
}).narrow(
  (value) =>
    value.method !== PAYMENT_METHOD.other ||
    (typeof value.note === "string" && value.note.trim().length > 0),
);
