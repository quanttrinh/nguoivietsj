// @boundary shared
import { type } from "arktype";

import { isRecord } from "~/shared/utils/records";

import { LIMITS } from "../limits";
import { PHONE_REGEX } from "../patterns";
import { patternStringSchema, unknownRecordSchema } from "./common";
import { ticketKeySchema } from "./tickets";

const contactPayloadBase = {
  "label?": type(`1 <= string <= ${LIMITS.text.contactLabel} | null`),
  "isPrimary?": type("boolean"),
  "isConfirmation?": type("boolean"),
  "value?": unknownRecordSchema,
};

function contactDefaults(value: {
  label?: string | null;
  isPrimary?: boolean;
  isConfirmation?: boolean;
  value?: unknown;
}): {
  label: string | null;
  isPrimary: boolean;
  isConfirmation: boolean;
  value: Record<string, unknown>;
} {
  return {
    label: value.label ?? null,
    isPrimary: value.isPrimary ?? false,
    isConfirmation: value.isConfirmation ?? false,
    value: isRecord(value.value) ? value.value : {},
  };
}

const emailContactPayloadSchema = type(contactPayloadBase, "&", {
  kind: type("'email'"),
  email: type(`1 <= string.email <= ${LIMITS.text.email}`),
});
export const emailContactSchema = emailContactPayloadSchema.pipe((value) => ({
  ...value,
  ...contactDefaults(value),
}));
export type EmailContact = typeof emailContactSchema.infer;

const phoneContactPayloadSchema = type(contactPayloadBase, "&", {
  kind: type("'phone'"),
  phone: patternStringSchema(PHONE_REGEX, LIMITS.text.phone),
});
export const phoneContactSchema = phoneContactPayloadSchema.pipe((value) => ({
  ...value,
  ...contactDefaults(value),
}));
export type PhoneContact = typeof phoneContactSchema.infer;

const mailContactPayloadSchema = type(contactPayloadBase, "&", {
  kind: type("'mail'"),
  addressLine1: type(`1 <= string <= ${LIMITS.text.addressLine}`),
  "addressLine2?": type(`1 <= string <= ${LIMITS.text.addressLine} | null`),
  city: type(`2 <= string <= ${LIMITS.text.city}`),
  province: type(`2 <= string <= 2`),
  postalCode: type(`3 <= string <= ${LIMITS.text.postalCode}`),
  "country?": type(`2 <= string <= 2`),
});
export const mailContactSchema = mailContactPayloadSchema.pipe((value) => ({
  ...value,
  ...contactDefaults(value),
  addressLine2: value.addressLine2 ?? null,
  country: value.country ?? "CA",
}));
export type MailContact = typeof mailContactSchema.infer;

export const contactSchema = emailContactSchema.or(phoneContactSchema).or(mailContactSchema);
export type ContactInput = typeof contactSchema.infer;

const ticketSelectionSchema = type({
  key: ticketKeySchema,
  quantity: type(`0 <= number.integer <= ${LIMITS.registration.ticketsPerRegistration}`),
});
export type TicketSelection = typeof ticketSelectionSchema.infer;

const registrationPayloadSchema = type({
  fullName: type(`1 <= string <= ${LIMITS.text.fullName}`),
  contacts: contactSchema.array().atLeastLength(1).atMostLength(LIMITS.registration.contacts),
  tickets: ticketSelectionSchema.array().atLeastLength(1).atMostLength(LIMITS.event.ticketTypes),
  consent: type("true"),
  "formVersion?": type(`1 <= number.integer <= ${LIMITS.registration.maxFormVersion} | null`),
  "answers?": unknownRecordSchema,
  "metadata?": unknownRecordSchema,
});

export const registrationSchema = registrationPayloadSchema.pipe((value) => ({
  ...value,
  formVersion: value.formVersion ?? null,
  answers: value.answers ?? {},
  metadata: value.metadata ?? {},
}));
export type RegistrationInput = typeof registrationSchema.infer;

const manualRegistrationPayloadSchema = type({
  fullName: type(`1 <= string <= ${LIMITS.text.fullName}`),
  "contacts?": contactSchema.array().atMostLength(LIMITS.registration.contacts),
  "tickets?": ticketSelectionSchema.array().atMostLength(LIMITS.event.ticketTypes),
  "consent?": type("boolean"),
  "formVersion?": type(`1 <= number.integer <= ${LIMITS.registration.maxFormVersion} | null`),
  "answers?": unknownRecordSchema,
  "metadata?": unknownRecordSchema,
});

/**
 * Staff-assisted registration input.
 *
 * Business checks such as registration-window, capacity, duplicate, and form
 * validation are intentionally skipped, so this schema only validates shape.
 */
export const manualRegistrationSchema = manualRegistrationPayloadSchema.pipe((value) => ({
  ...value,
  contacts: value.contacts ?? [],
  tickets: value.tickets ?? [],
  formVersion: value.formVersion ?? null,
  answers: value.answers ?? {},
  metadata: value.metadata ?? {},
}));
export type ManualRegistrationInput = typeof manualRegistrationSchema.infer;
