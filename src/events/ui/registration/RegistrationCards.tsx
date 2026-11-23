// @boundary client
import type { DeclaredLocales } from "intlayer";
import type { ComponentChildren, JSX } from "preact";

import { CONTACT_KIND } from "~/events/domain/constants";
import { localized } from "~/events/domain/localized";
import { defaultValueText, paymentMethodLabel } from "~/events/domain/presentation";
import type {
  LocalizedText,
  PaymentRecord,
  RegistrationContactRecord,
  RegistrationRecord,
  RegistrationTicketRecord,
} from "~/events/domain/types";

import type { RegistrationCardLabels } from "./labels";
import { registrationViewStyles as styles } from "./styles";

interface AnswerFieldView {
  key: string;
  label: LocalizedText;
  type: string;
}

function Card({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: ComponentChildren;
}) {
  return (
    <section class={styles.card}>
      <div class={styles.cardHeader}>
        <h2 class={styles.cardTitle}>{title}</h2>
        {count === undefined ? null : <span class={styles.count}>{count}</span>}
      </div>
      {children}
    </section>
  );
}

function DetailRow({ term, children }: { term: string; children: ComponentChildren }) {
  return (
    <div class={styles.row}>
      <dt class={styles.term}>{term}</dt>
      <dd class={styles.value}>{children}</dd>
    </div>
  );
}

export function RegistrationOverviewCard({
  eventTitle,
  registration,
  payment,
  amountDue,
  paymentStatusText,
  checkinStatusText,
  money,
  dateTime,
  labels,
  title,
  actions,
}: {
  eventTitle: string;
  registration: Pick<RegistrationRecord, "id" | "fullName" | "formVersion" | "createdAt">;
  payment: PaymentRecord | null;
  amountDue: number;
  paymentStatusText: string;
  checkinStatusText: string;
  money: Intl.NumberFormat;
  dateTime: Intl.DateTimeFormat;
  labels: RegistrationCardLabels;
  title?: string;
  actions?: ComponentChildren;
}): JSX.Element {
  return (
    <Card title={title ?? labels.fullName}>
      <dl class={styles.details}>
        <DetailRow term={labels.event}>{eventTitle}</DetailRow>
        <DetailRow term={labels.fullName}>{registration.fullName}</DetailRow>
        <DetailRow term={labels.registrationId}>
          <code class={styles.code}>{registration.id}</code>
        </DetailRow>
        <DetailRow term={labels.createdAt}>
          {dateTime.format(new Date(registration.createdAt))}
        </DetailRow>
        <DetailRow term={labels.formVersion}>
          {registration.formVersion === null ? "—" : String(registration.formVersion)}
        </DetailRow>
        <DetailRow term={labels.amountDue}>{money.format(amountDue / 100)}</DetailRow>
        <DetailRow term={labels.paymentStatus}>{paymentStatusText}</DetailRow>
        <DetailRow term={labels.checkedIn}>{checkinStatusText}</DetailRow>
        {payment === null ? null : (
          <>
            <DetailRow term={labels.amountPaid}>
              {money.format(payment.amountMinor / 100)}
            </DetailRow>
            <DetailRow term={labels.paymentMethod}>
              {paymentMethodLabel(payment.method, {
                cash: labels.paymentMethodCash,
                etransfer: labels.paymentMethodEtransfer,
                other: labels.paymentMethodOther,
              })}
            </DetailRow>
            <DetailRow term={labels.paymentConfirmedAt}>
              {dateTime.format(new Date(payment.updatedAt))}
            </DetailRow>
            {payment.note === null || payment.note.length === 0 ? null : (
              <DetailRow term={labels.paymentNote}>{payment.note}</DetailRow>
            )}
          </>
        )}
      </dl>
      <div class={styles.badgeRow}>{actions}</div>
    </Card>
  );
}

function contactFields(
  contact: RegistrationContactRecord,
  labels: RegistrationCardLabels,
): [string, string][] {
  const fields: [string, string][] = [];

  if (contact.emailAddress !== null) {
    fields.push([labels.email, contact.emailAddress]);
  }
  if (contact.phoneNumber !== null) {
    fields.push([labels.phone, contact.phoneNumber]);
  }
  if ((contact.addressLine1 ?? "").length > 0) {
    fields.push([labels.addressLine1, contact.addressLine1 ?? ""]);
  }
  if (contact.addressLine2 !== null) {
    fields.push([labels.addressLine2, contact.addressLine2]);
  }
  if ((contact.city ?? "").length > 0) {
    fields.push([labels.city, contact.city ?? ""]);
  }
  if ((contact.province ?? "").length > 0) {
    fields.push([labels.province, contact.province ?? ""]);
  }
  if ((contact.postalCode ?? "").length > 0) {
    fields.push([labels.postalCode, contact.postalCode ?? ""]);
  }
  if ((contact.country ?? "").length > 0) {
    fields.push([labels.country, contact.country ?? ""]);
  }
  if (contact.label !== null) {
    fields.push([labels.contactLabel, contact.label]);
  }

  for (const [key, value] of Object.entries(contact.value)) {
    fields.push([key, defaultValueText(value)]);
  }

  return fields;
}

function contactKindLabel(kind: string, labels: RegistrationCardLabels) {
  if (kind === CONTACT_KIND.email) {
    return labels.email;
  }
  if (kind === CONTACT_KIND.phone) {
    return labels.phone;
  }
  return labels.mail;
}

export function RegistrationContactsCard({
  contacts,
  labels,
}: {
  contacts: RegistrationContactRecord[];
  labels: RegistrationCardLabels;
}): JSX.Element {
  return (
    <Card title={labels.contacts} count={contacts.length}>
      {contacts.length === 0 ? (
        <p class={styles.empty}>{labels.noContacts}</p>
      ) : (
        <div class={styles.section}>
          {contacts.map((contact) => {
            const kind = contactKindLabel(contact.kind, labels);

            return (
              <div key={contact.id}>
                <div class={styles.badgeRow}>
                  <span class={styles.badgeAccent}>{kind}</span>
                  {contact.isPrimary ? (
                    <span class={styles.badge}>{labels.primaryContact}</span>
                  ) : null}
                  {contact.isConfirmation ? (
                    <span class={styles.badge}>{labels.confirmationContact}</span>
                  ) : null}
                </div>
                <dl class={styles.details}>
                  {contactFields(contact, labels).map(([term, value]) => (
                    <DetailRow key={`${term}-${value}`} term={term}>
                      {value}
                    </DetailRow>
                  ))}
                </dl>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export function RegistrationTicketsCard({
  tickets,
  locale,
  defaultLocale,
  money,
  labels,
}: {
  tickets: RegistrationTicketRecord[];
  locale: DeclaredLocales;
  defaultLocale: string;
  money: Intl.NumberFormat;
  labels: RegistrationCardLabels;
}): JSX.Element {
  return (
    <Card title={labels.tickets} count={tickets.length}>
      {tickets.length === 0 ? (
        <p class={styles.empty}>—</p>
      ) : (
        <table class={styles.table}>
          <thead>
            <tr>
              <th class={styles.th}>{labels.tickets}</th>
              <th class={styles.th}>{labels.quantity}</th>
              <th class={styles.th}>{labels.unitPrice}</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((ticket) => (
              <tr key={ticket.key}>
                <td class={styles.td}>
                  {localized(ticket.label, locale, ticket.key, defaultLocale)}
                  <p class={styles.note}>
                    <code class={styles.code}>{ticket.key}</code>
                  </p>
                </td>
                <td class={styles.td}>{ticket.quantity}</td>
                <td class={styles.td}>{money.format(ticket.unitPriceMinor / 100)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

export function RegistrationAnswersCard({
  answers,
  answerFields,
  locale,
  defaultLocale,
  labels,
}: {
  answers: Record<string, unknown>;
  answerFields: AnswerFieldView[];
  locale: DeclaredLocales;
  defaultLocale: string;
  labels: RegistrationCardLabels;
}): JSX.Element {
  const entries = Object.entries(answers);
  const fields = new Map(answerFields.map((field) => [field.key, field]));

  return (
    <Card title={labels.customAnswers} count={entries.length}>
      {entries.length === 0 ? (
        <p class={styles.empty}>{labels.noAnswers}</p>
      ) : (
        <table class={styles.table}>
          <thead>
            <tr>
              <th class={styles.th}>{labels.answerKey}</th>
              <th class={styles.th}>{labels.answerValue}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([key, value]) => {
              const field = fields.get(key);
              const label =
                field === undefined ? key : localized(field.label, locale, key, defaultLocale);

              return (
                <tr key={key}>
                  <td class={styles.td}>
                    <strong>{label}</strong>
                    {label === key ? null : (
                      <p class={styles.note}>
                        <code class={styles.code}>{key}</code>
                      </p>
                    )}
                  </td>
                  <td class={styles.td}>{defaultValueText(value)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}

export function RegistrationMetadataCard({
  metadata,
  labels,
}: {
  metadata: Record<string, unknown>;
  labels: RegistrationCardLabels;
}): JSX.Element {
  const entries = Object.entries(metadata);

  return (
    <Card title={labels.metadata} count={entries.length}>
      {entries.length === 0 ? (
        <p class={styles.empty}>—</p>
      ) : (
        <dl class={styles.details}>
          {entries.map(([key, value]) => (
            <DetailRow key={key} term={key}>
              {defaultValueText(value)}
            </DetailRow>
          ))}
        </dl>
      )}
    </Card>
  );
}
