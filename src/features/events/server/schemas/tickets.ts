// @boundary server
import { type } from "arktype";

import {
  localizedTextOrNullSchema,
  localizedTextSchema,
} from "~/features/events/domain/schemas/common";

export const ticketKeySchema = type("1 <= string <= 64").matching(/^[a-z][a-z0-9_]{0,63}$/u);

const priceMinorSchema = type("0 <= number.integer <= 100000000");
const quantitySchema = type("0 <= number.integer <= 1000");
const nullableQuantitySchema = type("0 <= number.integer <= 1000 | null");
const capacitySchema = type("0 <= number.integer <= 1000000 | null");
const sortOrderSchema = type("-1000 <= number.integer <= 1000");

export const ticketTypeSchema = type({
  key: ticketKeySchema,
  label: localizedTextSchema,
  description: localizedTextOrNullSchema.default(null),
  priceMinor: priceMinorSchema,
  minPerRegistration: quantitySchema,
  maxPerRegistration: nullableQuantitySchema.default(null),
  defaultQuantity: quantitySchema,
  capacity: capacitySchema.default(null),
  active: type("boolean"),
  sortOrder: sortOrderSchema,
});
export type TicketTypeInput = typeof ticketTypeSchema.infer;

export const ticketTypeUpdateSchema = type({
  "label?": localizedTextSchema,
  "description?": localizedTextOrNullSchema,
  "priceMinor?": priceMinorSchema,
  "minPerRegistration?": quantitySchema,
  "maxPerRegistration?": nullableQuantitySchema,
  "defaultQuantity?": quantitySchema,
  "capacity?": capacitySchema,
  "active?": type("boolean"),
  "sortOrder?": sortOrderSchema,
});
