/** Shared event-engine types used by API handlers and repositories. */

import type { RegistrationFormIssue } from "~/events/domain/form-schema/types";

import type {
  CONTACT_KIND,
  FORM_VERSION_STATUS,
  EventStatus,
  FormVersionStatus,
  PaymentMethod,
} from "./constants";

export type { ContactKind, EventStatus, FormVersionStatus, PaymentMethod } from "./constants";

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

export type LocalizedText = Record<string, string>;

export interface EventTicketLimits {
  currency: string;
  maxTicketsPerRegistration: number | null;
  maxTotalTickets: number | null;
}

export interface EventLocation {
  name: string;
  address: string;
  mapUrl: string | null;
  mapEmbedUrl: string | null;
}

export interface EventETransferPayment {
  enabled: boolean;
  email: string | null;
}

export interface EventCashPayment {
  enabled: boolean;
  address: string | null;
  mapUrl: string | null;
  mapEmbedUrl: string | null;
}

export interface EventPayments {
  etransfer: EventETransferPayment;
  cash: EventCashPayment;
}

export type EventNoteBlock =
  | { type: "paragraph"; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "link"; label: string; href: string };

export type EventNotes = Record<string, EventNoteBlock[]>;

export interface TicketTypeInput {
  key: string;
  label: LocalizedText;
  description: LocalizedText | null;
  priceMinor: number;
  minPerRegistration: number;
  maxPerRegistration: number | null;
  defaultQuantity: number;
  capacity: number | null;
  active: boolean;
  sortOrder: number;
}

export interface EventCreateInput {
  slug: string;
  eventType: string;
  editionYear: number;
  defaultLocale: string;
  aliases: string[];
  title: LocalizedText;
  summary: LocalizedText;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string;
  status: EventStatus;
  enabled: boolean;
  registrationOpen: boolean;
  limits: EventTicketLimits;
  location: EventLocation;
  payments: EventPayments;
  notes: EventNotes;
  ticketTypes: TicketTypeInput[];
}

export interface EventUpdateInput {
  defaultLocale?: string;
  aliases?: string[];
  title?: LocalizedText;
  summary?: LocalizedText;
  startsAt?: string | null;
  endsAt?: string | null;
  timezone?: string;
  status?: EventStatus;
  enabled?: boolean;
  registrationOpen?: boolean;
  limits?: EventTicketLimits;
  location?: EventLocation;
  payments?: EventPayments;
  notes?: EventNotes;
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

export interface FormVersionInput {
  version: number;
  schema: Record<string, unknown>;
  status: typeof FORM_VERSION_STATUS.draft | typeof FORM_VERSION_STATUS.published;
}

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

export interface EmailContactInput extends ContactInputBase {
  kind: typeof CONTACT_KIND.email;
  email: string;
  phone: null;
  addressLine1: null;
  addressLine2: null;
  city: null;
  province: null;
  postalCode: null;
  country: null;
}

export interface PhoneContactInput extends ContactInputBase {
  kind: typeof CONTACT_KIND.phone;
  email: null;
  phone: string;
  addressLine1: null;
  addressLine2: null;
  city: null;
  province: null;
  postalCode: null;
  country: null;
}

export interface MailContactInput extends ContactInputBase {
  kind: typeof CONTACT_KIND.mail;
  email: null;
  phone: null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  province: string;
  postalCode: string;
  country: string;
}

export type ContactInput = EmailContactInput | PhoneContactInput | MailContactInput;

export interface TicketSelection {
  key: string;
  quantity: number;
}

export interface RegistrationInput {
  fullName: string;
  contacts: ContactInput[];
  tickets: TicketSelection[];
  consent: boolean;
  formVersion: number | null;
  answers: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export type PreparedEmailContact = EmailContactInput & {
  id: string;
  emailNormalized: string;
  phoneNormalized: null;
};

export type PreparedPhoneContact = PhoneContactInput & {
  id: string;
  emailNormalized: null;
  phoneNormalized: string;
};

export type PreparedMailContact = MailContactInput & {
  id: string;
  emailNormalized: null;
  phoneNormalized: null;
};

export type PreparedContact = PreparedEmailContact | PreparedPhoneContact | PreparedMailContact;

export interface PreparedTicket {
  key: string;
  quantity: number;
  unitPriceMinor: number;
  currency: string;
  label: LocalizedText;
}

export interface PreparedAnswer {
  fieldKey: string;
  valueJson: string;
}

export interface PreparedRegistration {
  id: string;
  eventId: string;
  statusTokenHash: string;
  statusTokenExpiresAt: string;
  formVersion: number | null;
  fullName: string;
  fullNameNormalized: string;
  consentAt: string;
  metadataJson: string;
  contacts: PreparedContact[];
  tickets: PreparedTicket[];
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

export interface RegistrationError {
  status: number;
  error: string;
  fields?: string[];
  issues?: RegistrationFormIssue[];
}
