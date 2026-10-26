import type { RegistrationFormIssue } from "~/events/domain/form-schema/types";

export interface RegistrationMessages {
  required: string;
  fullName: string;
  fullNameInvalid: string;
  email: string;
  phone: string;
  postalCode: string;
  atLeastOneContact: string;
  atLeastOneTicket: string;
  ticketLimit: string;
  ticketTypeLimit: string;
  eventCapacity: string;
  duplicate: string;
  confirmationRequired: string;
  confirmationContact: string;
  confirmationMultiple: string;
  confirmationNotAllowed: string;
  duplicateContact: string;
  invalidValue: string;
  ticketUnavailable: string;
  groupOneOf: string;
  groupAtLeastOne: string;
  groupAllOf: string;
  invalidNumber: string;
  invalidOption: string;
  submit: string;
  invalidPayload: string;
  submitting: string;
  successTitle: string;
  successBody: string;
  registrationClosed: string;
  eventUnavailable: string;
  rateLimited: string;
  turnstile: string;
}

export interface RegistrationResponse {
  id?: string;
  registration?: { id?: string; statusUrl?: string };
  error?: string;
  fields?: string[];
  issues?: RegistrationFormIssue[];
}

export interface FormState {
  visible: Map<string, boolean>;
  required: Map<string, boolean>;
}
