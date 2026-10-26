import { TypeSystem } from "@sinclair/typebox/system";

import {
  CURRENCY_REGEX,
  EMAIL_REGEX,
  EVENT_SLUG_REGEX,
  EVENT_TYPE_REGEX,
  FORM_KEY_REGEX,
  FORM_REF_REGEX,
  LOCALE_KEY_REGEX,
  PHONE_REGEX,
  TICKET_KEY_REGEX,
} from "~/shared/constants/patterns";
import { isUuidV7 } from "~/shared/utils/uuid";

export const SCHEMA_FORMAT = {
  currency: "app-currency",
  email: "app-email",
  eventSlug: "app-event-slug",
  eventType: "app-event-type",
  formKey: "app-form-key",
  formRef: "app-form-ref",
  localeKey: "app-locale-key",
  phone: "app-phone",
  ticketKey: "app-ticket-key",
  uuidV7: "uuid-v7",
} as const;

TypeSystem.Format(SCHEMA_FORMAT.currency, (value) => CURRENCY_REGEX.test(value));
TypeSystem.Format(SCHEMA_FORMAT.email, (value) => EMAIL_REGEX.test(value));
TypeSystem.Format(SCHEMA_FORMAT.eventSlug, (value) => EVENT_SLUG_REGEX.test(value));
TypeSystem.Format(SCHEMA_FORMAT.eventType, (value) => EVENT_TYPE_REGEX.test(value));
TypeSystem.Format(SCHEMA_FORMAT.formKey, (value) => FORM_KEY_REGEX.test(value));
TypeSystem.Format(SCHEMA_FORMAT.formRef, (value) => FORM_REF_REGEX.test(value));
TypeSystem.Format(SCHEMA_FORMAT.localeKey, (value) => LOCALE_KEY_REGEX.test(value));
TypeSystem.Format(SCHEMA_FORMAT.phone, (value) => PHONE_REGEX.test(value));
TypeSystem.Format(SCHEMA_FORMAT.ticketKey, (value) => TICKET_KEY_REGEX.test(value));
TypeSystem.Format(SCHEMA_FORMAT.uuidV7, isUuidV7);
