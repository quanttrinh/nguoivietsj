// @boundary server
import { type } from "arktype";

import { TICKET_KEY_REGEX } from "~/features/events/domain/patterns";
import {
  localizedTextOrNullSchema,
  localizedTextSchema,
  patternStringSchema,
} from "~/features/events/domain/schemas/common";

export const ticketKeySchema = patternStringSchema(TICKET_KEY_REGEX, 64);

const ticketTypePayloadSchema = type({
  key: ticketKeySchema,
  label: localizedTextSchema,
  "description?": localizedTextOrNullSchema,
  priceMinor: type("0 <= number.integer <= 100000000"),
  minPerRegistration: type("0 <= number.integer <= 1000"),
  "maxPerRegistration?": type("0 <= number.integer <= 1000 | null"),
  defaultQuantity: type("0 <= number.integer <= 1000"),
  "capacity?": type("0 <= number.integer <= 1000000 | null"),
  active: type("boolean"),
  sortOrder: type("-1000 <= number.integer <= 1000"),
});

export const ticketTypeSchema = ticketTypePayloadSchema.pipe((value) => ({
  ...value,
  description: value.description ?? null,
  maxPerRegistration: value.maxPerRegistration ?? null,
  capacity: value.capacity ?? null,
}));
export type TicketTypeInput = typeof ticketTypeSchema.infer;

export const ticketTypeUpdateSchema = type({
  "label?": localizedTextSchema,
  "description?": localizedTextOrNullSchema,
  "priceMinor?": type("0 <= number.integer <= 100000000"),
  "minPerRegistration?": type("0 <= number.integer <= 1000"),
  "maxPerRegistration?": type("0 <= number.integer <= 1000 | null"),
  "defaultQuantity?": type("0 <= number.integer <= 1000"),
  "capacity?": type("0 <= number.integer <= 1000000 | null"),
  "active?": type("boolean"),
  "sortOrder?": type("-1000 <= number.integer <= 1000"),
});
