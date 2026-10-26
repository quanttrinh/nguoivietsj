import type { JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

import { css } from "styled-system/css";
import { grid, vstack, wrap } from "styled-system/patterns";
import { tableStyles } from "~/events/admin/islands/shared/table";
import { localized } from "~/events/domain/localized";
import { indexByRegistrationId, registrationAmountDue } from "~/events/domain/presentation";
import type { PaymentRecord, RegistrationRecord } from "~/events/domain/types";
import { apiErrorMessage } from "~/shared/client/api";
import { readFormValue } from "~/shared/client/form-controls";
import { useCachedJson } from "~/shared/client/use-cached-json";
import { dateTimeFormatter, moneyFormatter } from "~/shared/utils/format";

import { adminEventUrl } from "../islands/shared/routes";

export interface AdminPaymentsConfig {
  locale: string;
  payments: string;
  fullName: string;
  ticketsTotal: string;
  amountDue: string;
  paymentStatus: string;
  paymentMethod: string;
  cashPayment: string;
  etransferPayment: string;
  amountPaid: string;
  paymentNote: string;
  confirmPayment: string;
  updatePayment: string;
  removePayment: string;
  paymentConfirmedAt: string;
  paid: string;
  unpaid: string;
  noPaymentRequired: string;
  noRegistrations: string;
  loadFailed: string;
  forbidden: string;
  eventNotFound: string;
  paymentSaved: string;
  paymentRemoved: string;
  paymentEmailFailed: string;
  paymentFailed: string;
  removePaymentConfirm: string;
  savingPayment: string;
}

interface PaymentsResponse {
  event: {
    id: string;
    title: Record<string, string>;
    timezone: string;
    limits: { currency: string };
  };
  registrations: RegistrationRecord[];
  payments: PaymentRecord[];
}

interface NoticeState {
  message: string;
  tone: "success" | "error";
}

const styles = {
  form: vstack({ alignItems: "stretch", gap: "2", minWidth: "48", maxWidth: "64" }),
  amountRow: grid({ columns: 2, gap: "2" }),
  field: vstack({ alignItems: "stretch", gap: "1.5" }),
  actions: wrap({ alignItems: "center", gap: "3" }),
  notice: css({
    margin: "0",
    borderRadius: "lg",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "tertiary",
    backgroundColor: "tertiaryContainer",
    color: "onTertiaryContainer",
    paddingInline: "4",
    paddingBlock: "3.5",
    fontSize: "sm",
    lineHeight: "relaxed",
    marginBlockEnd: "5",
    '&[data-tone="error"]': {
      borderColor: "error",
      backgroundColor: "errorContainer",
      color: "onErrorContainer",
    },
  }),
} as const;

function paymentStatus(
  payment: PaymentRecord | null,
  due: number,
  config: AdminPaymentsConfig,
): string {
  if (payment !== null) {
    return config.paid;
  }
  return due === 0 ? config.noPaymentRequired : config.unpaid;
}

function amountMinor(form: HTMLFormElement, due: number): number | null {
  const value = readFormValue(form, "amount").trim();

  if (value.length === 0) {
    return due;
  }

  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : null;
}

function PaymentForm(props: {
  registration: RegistrationRecord;
  payment: PaymentRecord | null;
  config: AdminPaymentsConfig;
  pending: boolean;
  onSave: (event: Event, registration: RegistrationRecord, due: number) => void;
  onRemove: (registration: RegistrationRecord) => void;
}): JSX.Element {
  const due = registrationAmountDue(props.registration);
  const payment = props.payment;
  const method = payment?.method ?? "cash";
  const amount = ((payment?.amountMinor ?? due) / 100).toFixed(2);
  const submitLabel = ((): string => {
    if (props.pending) {
      return props.config.savingPayment;
    }
    return payment === null ? props.config.confirmPayment : props.config.updatePayment;
  })();

  return (
    <form
      class={styles.form}
      onSubmit={(event) => {
        props.onSave(event, props.registration, due);
      }}
    >
      <div class={styles.amountRow}>
        <qui-field class={styles.field}>
          <qui-field-label>{props.config.paymentMethod}</qui-field-label>
          <qui-select name="method" default-value={JSON.stringify([method])}>
            <qui-option value="cash">{props.config.cashPayment}</qui-option>
            <qui-option value="etransfer">{props.config.etransferPayment}</qui-option>
          </qui-select>
        </qui-field>
        <qui-field class={styles.field}>
          <qui-field-label>{props.config.amountPaid}</qui-field-label>
          <qui-input
            name="amount"
            input-type="number"
            input-mode-hint="decimal"
            min={0}
            step={0.01}
            default-value={amount}
          />
        </qui-field>
      </div>
      <qui-field class={styles.field}>
        <qui-field-label>{props.config.paymentNote}</qui-field-label>
        <qui-input name="note" max-length="500" default-value={payment?.note ?? ""} />
      </qui-field>
      <div class={styles.actions}>
        <qui-button type="submit" variant="outlined" disabled={props.pending}>
          {submitLabel}
        </qui-button>
        {payment === null ? null : (
          <qui-button
            type="button"
            variant="text"
            disabled={props.pending}
            onClick={() => {
              props.onRemove(props.registration);
            }}
          >
            {props.config.removePayment}
          </qui-button>
        )}
      </div>
    </form>
  );
}

export default function AdminPayments(props: { config: AdminPaymentsConfig }): JSX.Element {
  const [eventId, setEventId] = useState<string | null | undefined>();
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(globalThis.location.search);
    const id = params.get("event");
    setEventId(id);

    if (params.get("payment_email") === "failed") {
      setNotice({ message: props.config.paymentEmailFailed, tone: "error" });
    } else if (params.get("payment") === "saved") {
      setNotice({ message: props.config.paymentSaved, tone: "success" });
    } else if (params.get("payment") === "removed") {
      setNotice({ message: props.config.paymentRemoved, tone: "success" });
    }
  }, [props.config]);

  useEffect(() => {
    noticeRef.current?.focus();
  }, [notice]);

  const api =
    eventId === undefined || eventId === null
      ? null
      : `/api/events/admin/events/${encodeURIComponent(eventId)}/payments`;
  const { data, error, loading } = useCachedJson<PaymentsResponse>(api);

  useEffect(() => {
    const back = document.querySelector<HTMLAnchorElement>("#engine-payments-back");

    if (back !== null && eventId !== undefined && eventId !== null) {
      back.href = adminEventUrl(props.config.locale, { eventId });
    }
  }, [eventId, props.config.locale]);

  useEffect(() => {
    if (data === null) {
      return;
    }

    const title = localized(data.event.title, props.config.locale, "");
    const heading = document.querySelector<HTMLElement>("#engine-payments-title");

    if (heading !== null) {
      heading.textContent = title;
    }

    document.title = `${props.config.payments}: ${title}`;
  }, [data, props.config]);

  function show(message: string, tone: NoticeState["tone"]): void {
    setNotice({ message, tone });
  }

  async function savePayment(
    event: Event,
    registration: RegistrationRecord,
    due: number,
  ): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;

    if (!(form instanceof HTMLFormElement) || api === null) {
      show(props.config.paymentFailed, "error");
      return;
    }

    const method = readFormValue(form, "method").trim();
    const amount = amountMinor(form, due);

    if (method.length === 0 || amount === null) {
      show(props.config.paymentFailed, "error");
      return;
    }

    setPendingId(registration.id);

    try {
      const response = await fetch(`${api}/${encodeURIComponent(registration.id)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          method,
          amountMinor: amount,
          note: readFormValue(form, "note").trim() || null,
        }),
      });

      if (!response.ok) {
        throw new Error(`payment_failed_${response.status}`);
      }

      const body = (await response.json().catch(() => null)) as {
        created?: boolean;
        emailQueued?: boolean;
      } | null;
      const url = new URL(globalThis.location.href);
      url.searchParams.set("payment", "saved");

      if (body?.created === true && body.emailQueued === false) {
        url.searchParams.set("payment_email", "failed");
      } else {
        url.searchParams.delete("payment_email");
      }

      globalThis.location.assign(url.toString());
    } catch (error_) {
      console.error(error_);
      show(props.config.paymentFailed, "error");
    } finally {
      setPendingId(null);
    }
  }

  async function removePayment(registration: RegistrationRecord): Promise<void> {
    if (api === null) {
      return;
    }

    // oxlint-disable-next-line eslint/no-alert -- Removing a payment needs confirmation.
    if (!globalThis.confirm(props.config.removePaymentConfirm)) {
      return;
    }

    setPendingId(registration.id);

    try {
      const response = await fetch(`${api}/${encodeURIComponent(registration.id)}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(`payment_remove_failed_${response.status}`);
      }

      const url = new URL(globalThis.location.href);
      url.searchParams.set("payment", "removed");
      url.searchParams.delete("payment_email");
      globalThis.location.assign(url.toString());
    } catch (error_) {
      console.error(error_);
      show(props.config.paymentFailed, "error");
    } finally {
      setPendingId(null);
    }
  }

  const money =
    data === null ? null : moneyFormatter(props.config.locale, data.event.limits.currency);
  const dateTime =
    data === null ? null : dateTimeFormatter(props.config.locale, data.event.timezone);
  const payments: Map<string, PaymentRecord> =
    data === null
      ? new Map<string, PaymentRecord>()
      : indexByRegistrationId<PaymentRecord>(data.payments);

  return (
    <>
      <div
        ref={noticeRef}
        class={styles.notice}
        role={notice?.tone === "error" ? "alert" : "status"}
        tabIndex={-1}
        data-tone={notice?.tone === "error" ? "error" : undefined}
        hidden={notice === null}
      >
        {notice?.message}
      </div>

      {eventId === undefined || loading ? <p class={tableStyles.note}>…</p> : null}
      {eventId === null ? <p class={tableStyles.error}>{props.config.eventNotFound}</p> : null}
      {error !== null && data === null ? (
        <p class={tableStyles.error}>
          {apiErrorMessage(error, {
            loadFailed: props.config.loadFailed,
            forbidden: props.config.forbidden,
            notFound: props.config.eventNotFound,
          })}
        </p>
      ) : null}

      {data !== null && data.registrations.length === 0 ? (
        <p class={tableStyles.empty}>{props.config.noRegistrations}</p>
      ) : null}

      {data !== null && data.registrations.length > 0 && money !== null && dateTime !== null ? (
        <table class={tableStyles.table}>
          <thead>
            <tr>
              <th class={tableStyles.th}>{props.config.fullName}</th>
              <th class={tableStyles.th}>{props.config.ticketsTotal}</th>
              <th class={tableStyles.th}>{props.config.amountDue}</th>
              <th class={tableStyles.th}>{props.config.paymentStatus}</th>
              <th class={tableStyles.th}>{props.config.payments}</th>
            </tr>
          </thead>
          <tbody>
            {data.registrations.map((registration) => {
              const due = registrationAmountDue(registration);
              const payment = payments.get(registration.id) ?? null;
              const isPending = pendingId === registration.id;
              return (
                <tr key={registration.id}>
                  <td class={tableStyles.td}>
                    <strong>{registration.fullName}</strong>
                    <p class={tableStyles.note}>{registration.id}</p>
                  </td>
                  <td class={tableStyles.td}>
                    {registration.tickets
                      .map((ticket) => `${ticket.key} × ${ticket.quantity}`)
                      .join(", ")}
                  </td>
                  <td class={tableStyles.td}>{money.format(due / 100)}</td>
                  <td class={tableStyles.td}>
                    <span class={tableStyles.badge}>
                      {paymentStatus(payment, due, props.config)}
                    </span>
                    {payment === null ? null : (
                      <>
                        <p class={tableStyles.note}>
                          {payment.method === "cash"
                            ? props.config.cashPayment
                            : props.config.etransferPayment}{" "}
                          · {money.format(payment.amountMinor / 100)}
                        </p>
                        <p class={tableStyles.note}>
                          {props.config.paymentConfirmedAt}:{" "}
                          {dateTime.format(new Date(payment.updatedAt))}
                        </p>
                        {payment.note !== null && payment.note.length > 0 ? (
                          <p class={tableStyles.note}>{payment.note}</p>
                        ) : null}
                      </>
                    )}
                  </td>
                  <td class={tableStyles.td}>
                    {due !== 0 || payment !== null ? (
                      <PaymentForm
                        registration={registration}
                        payment={payment}
                        config={props.config}
                        pending={isPending}
                        onSave={(event, reg, registrationDue) => {
                          void savePayment(event, reg, registrationDue);
                        }}
                        onRemove={(reg) => {
                          void removePayment(reg);
                        }}
                      />
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
    </>
  );
}
