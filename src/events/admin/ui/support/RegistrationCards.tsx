// @boundary client
import type { DeclaredLocales } from "intlayer";
import type { JSX } from "preact";

import { adminEventUrl } from "~/events/admin/ui/shared/routes";
import { tableStyles } from "~/events/admin/ui/shared/styles/table";
import {
  contactDisplay,
  indexByRegistrationId,
  registrationAmountDue,
  ticketSummary,
} from "~/events/domain/presentation";
import type { CheckinRecord, PaymentRecord } from "~/events/domain/types";

import type { AdminSupportLabels, SupportData } from "./AdminSupport";

export default function RegistrationCards({
  data,
  locale,
  labels,
  money,
  dateTime,
  eventId,
  paymentText,
  onEdit,
}: {
  data: SupportData;
  locale: DeclaredLocales;
  labels: AdminSupportLabels;
  money: Intl.NumberFormat;
  dateTime: Intl.DateTimeFormat;
  eventId: string;
  paymentText: (payment: PaymentRecord | null, due: number) => string;
  onEdit: (registrationId: string) => void;
}): JSX.Element {
  const paymentsById = indexByRegistrationId<PaymentRecord>(data.payments);
  const checkinsById = indexByRegistrationId<CheckinRecord>(data.checkins);

  return (
    <div class={tableStyles.mobileCards}>
      {data.registrations.map((registration) => {
        const due = registrationAmountDue(registration);
        const payment = paymentsById.get(registration.id) ?? null;
        const checkin = checkinsById.get(registration.id) ?? null;

        return (
          <div class={tableStyles.mobileCard} key={registration.id}>
            <div class={tableStyles.mobileCardHeading}>
              <a
                class={tableStyles.link}
                href={adminEventUrl(locale, {
                  view: "registration",
                  eventId,
                  params: new URLSearchParams({ registration: registration.id }),
                })}
              >
                <strong>{registration.fullName}</strong>
              </a>
              <a
                class={tableStyles.link}
                href={adminEventUrl(locale, {
                  view: "qr",
                  eventId,
                  params: new URLSearchParams({ registration: registration.id }),
                })}
              >
                {labels.qrCode}
              </a>
            </div>
            <p class={tableStyles.note}>
              <code class={tableStyles.code}>{registration.id}</code>
            </p>
            <div class={tableStyles.mobileCardGrid}>
              <div>
                <span class={tableStyles.mobileCardLabel}>{labels.contact}</span>
                <span class={tableStyles.mobileCardValue}>
                  {registration.contacts.map((contact) => contactDisplay(contact)).join("; ")}
                </span>
              </div>
              <div>
                <span class={tableStyles.mobileCardLabel}>{labels.ticketsTotal}</span>
                <span class={tableStyles.mobileCardValue}>
                  {ticketSummary(registration.tickets)}
                </span>
              </div>
              <div>
                <span class={tableStyles.mobileCardLabel}>{labels.amountDue}</span>
                <span class={tableStyles.mobileCardValue}>{money.format(due / 100)}</span>
              </div>
              <div>
                <span class={tableStyles.mobileCardLabel}>{labels.paymentStatus}</span>
                <span class={tableStyles.mobileCardValue}>{paymentText(payment, due)}</span>
              </div>
              <div>
                <span class={tableStyles.mobileCardLabel}>{labels.checkinFilter}</span>
                <span class={tableStyles.mobileCardValue}>
                  {checkin === null
                    ? labels.notAvailable
                    : dateTime.format(new Date(checkin.checkedInAt))}
                </span>
              </div>
              <div>
                <span class={tableStyles.mobileCardLabel}>{labels.createdAt}</span>
                <span class={tableStyles.mobileCardValue}>
                  {dateTime.format(new Date(registration.createdAt))}
                </span>
              </div>
            </div>
            {due === 0 && payment === null ? null : (
              <p class={tableStyles.note}>
                <button
                  type="button"
                  class={tableStyles.link}
                  onClick={() => {
                    onEdit(registration.id);
                  }}
                >
                  {payment === null ? labels.confirmPayment : labels.updatePayment}
                </button>
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
