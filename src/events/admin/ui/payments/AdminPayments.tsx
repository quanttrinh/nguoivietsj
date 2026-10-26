// @boundary client
import { type InferResponseType } from "hono/client";
import { type JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

import { css } from "styled-system/css";
import { vstack, wrap } from "styled-system/patterns";
import { adminQueries, adminRefresh } from "~/events/admin/ui/shared/queries";
import { tableStyles } from "~/events/admin/ui/shared/table";
import { MAX_PAYMENT_NOTE_LENGTH } from "~/events/domain/limits";
import { localized } from "~/events/domain/localized";
import {
  indexByRegistrationId,
  registrationAmountDue,
  registrationPaymentStatusText,
} from "~/events/domain/presentation";
import { type PaymentRecord } from "~/events/domain/types";
import { apiClient, apiErrorMessage, readApiJson } from "~/shared/client/api/client";
import { readFormValue } from "~/shared/client/form-controls";
import { clientLogger } from "~/shared/client/logger";
import { useQuery } from "~/shared/client/query/use-query";
import { noticeStyles } from "~/shared/ui/notice-styles";
import { dateTimeFormatter, moneyFormatter } from "~/shared/utils/format";

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
  otherPayment: string;
  otherPaymentNoteHelp: string;
  paymentNoteRequired: string;
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

const getPayments = apiClient.api.admin.events[":eventId"].payments.$get;
const updatePayment =
  apiClient.api.admin.events[":eventId"].registrations[":registrationId"].payment.$post;
const removePaymentRecord =
  apiClient.api.admin.events[":eventId"].registrations[":registrationId"].payment.$delete;
type PaymentsResponse = InferResponseType<typeof getPayments, 200>["data"];
type PaymentRegistration = PaymentsResponse["registrations"][number];

interface NoticeState {
  message: string;
  tone: "success" | "error";
}

const styles = {
  form: vstack({ alignItems: "stretch", gap: "2", minW: "48", maxW: "64" }),
  field: vstack({ alignItems: "stretch", gap: "1.5" }),
  actions: wrap({ alignItems: "center", gap: "3" }),
  noticeShell: css({ paddingBlockEnd: "5" }),
  notice: noticeStyles.notice,
} as const;

function paymentMethodLabel(method: string, config: AdminPaymentsConfig): string {
  if (method === "cash") {
    return config.cashPayment;
  }

  return method === "etransfer" ? config.etransferPayment : config.otherPayment;
}

function PaymentForm(props: {
  registration: PaymentRegistration;
  payment: PaymentRecord | null;
  config: AdminPaymentsConfig;
  pending: boolean;
  onSave: (event: Event, registration: PaymentRegistration) => void;
  onRemove: (registration: PaymentRegistration) => void;
}): JSX.Element {
  const payment = props.payment;
  const [method, setMethod] = useState<string>(payment?.method ?? "cash");
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
        props.onSave(event, props.registration);
      }}
    >
      <qui-field class={styles.field}>
        <qui-field-label>{props.config.paymentMethod}</qui-field-label>
        <qui-select
          name="method"
          defaultValue={[method]}
          onvaluechange={(event) => {
            setMethod(event.detail.value[0] ?? "cash");
          }}
        >
          <qui-option value="cash">{props.config.cashPayment}</qui-option>
          <qui-option value="etransfer">{props.config.etransferPayment}</qui-option>
          <qui-option value="other">{props.config.otherPayment}</qui-option>
        </qui-select>
      </qui-field>
      <qui-field class={styles.field}>
        <qui-field-label>{props.config.paymentNote}</qui-field-label>
        <qui-input
          name="note"
          maxLength={MAX_PAYMENT_NOTE_LENGTH}
          required={method === "other"}
          defaultValue={payment?.note ?? ""}
        />
        {method === "other" ? (
          <qui-field-helper-text>{props.config.otherPaymentNoteHelp}</qui-field-helper-text>
        ) : null}
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

  const { data, error, loading } = useQuery(
    eventId == null ? null : adminQueries.payments(eventId),
  );

  useEffect(() => {
    if (data === null) {
      return;
    }

    const title = localized(data.event.title, props.config.locale, "");

    document.title = `${props.config.payments}: ${title}`;
  }, [data, props.config]);

  function show(message: string, tone: NoticeState["tone"]): void {
    setNotice({ message, tone });
  }

  async function savePayment(event: Event, registration: PaymentRegistration): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;

    if (!(form instanceof HTMLFormElement) || eventId == null) {
      show(props.config.paymentFailed, "error");
      return;
    }

    const method = readFormValue(form, "method").trim();
    const note = readFormValue(form, "note").trim();

    if (method !== "cash" && method !== "etransfer" && method !== "other") {
      show(props.config.paymentFailed, "error");
      return;
    }

    if (method === "other" && note.length === 0) {
      show(props.config.paymentNoteRequired, "error");
      return;
    }

    setPendingId(registration.id);

    try {
      const body = await readApiJson(
        await updatePayment({
          param: { eventId, registrationId: registration.id },
          json: {
            method,
            note: note || null,
          },
        }),
      );

      const url = new URL(globalThis.location.href);
      url.searchParams.set("payment", "saved");

      if (body.data.created && !body.data.emailQueued) {
        url.searchParams.set("payment_email", "failed");
        show(props.config.paymentEmailFailed, "error");
      } else {
        url.searchParams.delete("payment_email");
        show(props.config.paymentSaved, "success");
      }

      globalThis.history.replaceState(globalThis.history.state, "", url);
      adminRefresh.afterPaymentWrite(eventId);
    } catch (error_) {
      clientLogger.error(error_);
      show(apiErrorMessage(error_, props.config.paymentFailed), "error");
    } finally {
      setPendingId(null);
    }
  }

  async function removePayment(registration: PaymentRegistration): Promise<void> {
    if (eventId == null) {
      return;
    }

    // oxlint-disable-next-line eslint/no-alert -- Removing a payment needs confirmation.
    if (!globalThis.confirm(props.config.removePaymentConfirm)) {
      return;
    }

    setPendingId(registration.id);

    try {
      await readApiJson(
        await removePaymentRecord({
          param: { eventId, registrationId: registration.id },
        }),
      );

      const url = new URL(globalThis.location.href);
      url.searchParams.set("payment", "removed");
      url.searchParams.delete("payment_email");
      globalThis.history.replaceState(globalThis.history.state, "", url);
      show(props.config.paymentRemoved, "success");
      adminRefresh.afterPaymentWrite(eventId);
    } catch (error_) {
      clientLogger.error(error_);
      show(apiErrorMessage(error_, props.config.paymentFailed), "error");
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
      <div class={styles.noticeShell} hidden={notice === null}>
        <div
          ref={noticeRef}
          class={styles.notice}
          role={notice?.tone === "error" ? "alert" : "status"}
          tabIndex={-1}
          data-tone={notice?.tone === "error" ? "error" : undefined}
        >
          {notice?.message}
        </div>
      </div>

      {eventId === undefined || loading ? <p class={tableStyles.note}>…</p> : null}
      {eventId === null ? <p class={tableStyles.error}>{props.config.eventNotFound}</p> : null}
      {error !== null && data === null ? (
        <p class={tableStyles.error}>{apiErrorMessage(error, props.config.loadFailed)}</p>
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
                      {registrationPaymentStatusText(payment, due, props.config)}
                    </span>
                    {payment === null ? null : (
                      <>
                        <p class={tableStyles.note}>
                          {paymentMethodLabel(payment.method, props.config)}
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
                        onSave={(event, reg) => {
                          void savePayment(event, reg);
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
