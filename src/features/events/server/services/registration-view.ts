// @boundary server
import { isRegistrationPaid } from "~/features/events/domain/payment";
// @boundary server
import { registrationAmountDue } from "~/features/events/domain/presentation";
import type {
  CheckinRecord,
  EventWithLimits,
  FormVersionRecord,
  PaymentRecord,
  RegistrationRecord,
} from "~/features/events/domain/types";
import {
  answerFieldsFromSchema,
  type AnswerFieldView,
} from "~/features/events/server/services/registration-answer-fields";
// @boundary server
import {
  getCheckinRepository,
  getEventRepository,
  getFormVersionRepository,
  getPaymentRepository,
  getRegistrationRepository,
} from "~/platform/server/db/events";

/** Everything the staff detail, check-in QR, and attendee status views assemble. */
export interface RegistrationView {
  event: EventWithLimits;
  registration: RegistrationRecord;
  payment: PaymentRecord | null;
  checkin: CheckinRecord | null;
  formVersion: FormVersionRecord | null;
  amountDue: number;
  currency: string;
  due: { amountMinor: number; currency: string };
  answerFields: AnswerFieldView[];
  paid: boolean;
}

export type RegistrationViewLookup =
  | { ok: true; view: RegistrationView }
  | { ok: false; reason: "event_not_found" | "registration_not_found" };

/** Load one registration's detail bundle; callers pick the fields they expose. */
export interface RegistrationViewRequest {
  readonly db: D1Database;
  readonly eventId: string;
  readonly registrationId: string;
  readonly details?: boolean;
}

export async function loadRegistrationView({
  db,
  eventId,
  registrationId,
  details = true,
}: RegistrationViewRequest): Promise<RegistrationViewLookup> {
  const [event, registration] = await Promise.all([
    getEventRepository(db).findWithLimits(eventId),
    getRegistrationRepository(db).findById(eventId, registrationId),
  ]);

  if (event === null) {
    return { ok: false, reason: "event_not_found" };
  }
  if (registration === null) {
    return { ok: false, reason: "registration_not_found" };
  }

  // The QR view only needs payment state; skip check-in/form lookups there.
  const [payment, checkin, formVersion] = await Promise.all([
    getPaymentRepository(db).findByRegistrationId(registrationId),
    details
      ? getCheckinRepository(db).findByRegistration(eventId, registrationId)
      : Promise.resolve(null),
    details && registration.formVersion !== null
      ? getFormVersionRepository(db).findByVersion(eventId, registration.formVersion)
      : Promise.resolve(null),
  ]);
  const amountDue = registrationAmountDue(registration);
  const currency = registration.tickets[0]?.currency ?? event.limits.currency;

  return {
    ok: true,
    view: {
      event,
      registration,
      payment,
      checkin,
      formVersion,
      amountDue,
      currency,
      due: { amountMinor: amountDue, currency },
      answerFields: formVersion === null ? [] : answerFieldsFromSchema(formVersion.schema),
      paid: isRegistrationPaid(payment, amountDue),
    },
  };
}
