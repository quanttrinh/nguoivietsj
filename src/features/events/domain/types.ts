// @boundary shared
/* oxlint-disable unicorn/prefer-export-from -- schema types are also used by record interfaces in this module. */
/** Shared event-engine record types plus schema-derived input types. */

import type { LocalizedText } from "~/features/events/domain/schemas/common";
import type {
  EventPayments,
  EventTicketLimits,
  EventLocation,
} from "~/features/events/server/schemas/event";
import type { EventNotes } from "~/features/events/server/schemas/notes";
import type { TicketTypeInput } from "~/features/events/server/schemas/tickets";

import type { CONTACT_KIND, EventStatus, FormVersionStatus, PaymentMethod } from "./constants";

export type { ContactKind, EventStatus, FormVersionStatus, PaymentMethod } from "./constants";

export type {
  ContactInput,
  EmailContact,
  MailContact,
  PhoneContact,
  RegistrationInput,
  TicketSelection,
} from "~/features/events/server/schemas/registration";
export type { EventCreateInput, EventUpdateInput } from "~/features/events/server/schemas/event";
export type { EventNoteBlock, EventNotes } from "~/features/events/server/schemas/notes";
export type { LocalizedText } from "~/features/events/domain/schemas/common";
export type { TicketTypeInput } from "~/features/events/server/schemas/tickets";
export type { FormVersionInput } from "~/features/events/server/schemas/form";

export type { EventLocation, EventPayments, EventTicketLimits };

export interface PaymentRecord {
  id: string;
  registrationId: string;
  amountMinor: number;
  currency: string;
  method: PaymentMethod;
  confirmedBy: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventRecord {
  id: string;
  slug: string;
  eventType: string;
  editionYear: number;
  defaultLocale: string;
  aliases: string[];
  status: EventStatus;
  enabled: boolean;
  registrationOpen: boolean;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string;
  title: LocalizedText;
  summary: LocalizedText;
  location: EventLocation;
  payments: EventPayments;
  notes: EventNotes;
  createdAt: string;
  updatedAt: string;
  registrationCount: number;
  ticketsTotal: number;
}

export type RegistrationSummary = Omit<RegistrationRecord, "answers">;

export interface TicketTypeRecord extends TicketTypeInput {
  eventId: string;
  ticketsSold: number;
  createdAt: string;
  updatedAt: string;
}

export interface EventWithLimits extends EventRecord {
  limits: EventTicketLimits;
}

export interface EventDetail extends EventWithLimits {
  ticketTypes: TicketTypeRecord[];
}

export type PublicEventSummary = Pick<
  EventRecord,
  | "id"
  | "slug"
  | "defaultLocale"
  | "status"
  | "registrationOpen"
  | "startsAt"
  | "endsAt"
  | "timezone"
  | "title"
  | "summary"
>;

export interface FormVersionRecord {
  eventId: string;
  version: number;
  schema: Record<string, unknown>;
  status: FormVersionStatus;
  createdAt: string;
  publishedAt: string | null;
}

export interface ContactInputBase {
  label: string | null;
  isPrimary: boolean;
  isConfirmation: boolean;
  value: Record<string, unknown>;
}

/** A contact ready to persist: every kind-specific column is present or explicitly null. */
type ContactColumns = ContactInputBase & {
  id: string;
  emailNormalized: string | null;
  phoneNormalized: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  country: string | null;
};

export type PreparedEmailContact = ContactColumns & {
  kind: typeof CONTACT_KIND.email;
  email: string;
  emailNormalized: string;
  phone: null;
  phoneNormalized: null;
};

export type PreparedPhoneContact = ContactColumns & {
  kind: typeof CONTACT_KIND.phone;
  email: null;
  emailNormalized: null;
  phone: string;
  phoneNormalized: string;
};

export type PreparedMailContact = ContactColumns & {
  kind: typeof CONTACT_KIND.mail;
  email: null;
  emailNormalized: null;
  phone: null;
  phoneNormalized: null;
  addressLine1: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
};

export type PreparedContact = PreparedEmailContact | PreparedPhoneContact | PreparedMailContact;

export interface PreparedAnswer {
  fieldKey: string;
  value: unknown;
}

export interface PreparedRegistration {
  id: string;
  eventId: string;
  statusTokenHash: string;
  statusTokenExpiresAt: string;
  formVersion: number | null;
  manual: boolean;
  fullName: string;
  fullNameNormalized: string;
  consentAt: string;
  metadata: Record<string, unknown>;
  contacts: PreparedContact[];
  tickets: RegistrationTicketRecord[];
  answers: PreparedAnswer[];
}

export interface RegistrationContactBase extends ContactInputBase {
  id: string;
}

export interface RegistrationEmailContact extends RegistrationContactBase {
  kind: typeof CONTACT_KIND.email;
  emailAddress: string;
  phoneNumber: null;
  addressLine1: null;
  addressLine2: null;
  city: null;
  province: null;
  postalCode: null;
  country: null;
}

export interface RegistrationPhoneContact extends RegistrationContactBase {
  kind: typeof CONTACT_KIND.phone;
  emailAddress: null;
  phoneNumber: string;
  addressLine1: null;
  addressLine2: null;
  city: null;
  province: null;
  postalCode: null;
  country: null;
}

export interface RegistrationMailContact extends RegistrationContactBase {
  kind: typeof CONTACT_KIND.mail;
  emailAddress: null;
  phoneNumber: null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  province: string;
  postalCode: string;
  country: string;
}

export type RegistrationContactRecord =
  | RegistrationEmailContact
  | RegistrationPhoneContact
  | RegistrationMailContact;

export interface RegistrationTicketRecord {
  key: string;
  quantity: number;
  unitPriceMinor: number;
  currency: string;
  label: LocalizedText;
}

export interface RegistrationRecord {
  id: string;
  eventId: string;
  formVersion: number | null;
  fullName: string;
  createdAt: string;
  metadata: Record<string, unknown>;
  contacts: RegistrationContactRecord[];
  tickets: RegistrationTicketRecord[];
  answers: Record<string, unknown>;
}

export interface CheckinRecord {
  id: string;
  eventId: string;
  registrationId: string;
  checkedInAt: string;
}

export interface CheckinListItem extends CheckinRecord {
  fullName: string;
}

export interface RegistrationResult {
  id: string;
  eventId: string;
  amountMinor: number;
  ticketsTotal: number;
  statusToken: string;
}
