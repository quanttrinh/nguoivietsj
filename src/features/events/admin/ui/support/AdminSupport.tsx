// @boundary client
import { navigate } from "astro:transitions/client";
import type { InferResponseType } from "hono/client";
import type { JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

import { grid, hstack, wrap } from "styled-system/patterns";
import PaymentForm, { type PaymentResult } from "~/features/events/admin/ui/payments/PaymentForm";
import {
  adminQueries,
  type AdminCheckinFilter,
  type AdminPaymentFilter,
  type AdminSupportFilters,
} from "~/features/events/admin/ui/shared/queries";
import { adminEventUrl } from "~/features/events/admin/ui/shared/routes";
import { adminStyles } from "~/features/events/admin/ui/shared/styles/admin-styles";
import { tableStyles } from "~/features/events/admin/ui/shared/styles/table";
import { MAX_REGISTRATION_SEARCH_QUERY_LENGTH } from "~/features/events/domain/limits";
import { localized } from "~/features/events/domain/localized";
import {
  contactDisplay,
  indexByRegistrationId,
  paymentMethodLabel,
  registrationAmountDue,
  ticketSummary,
} from "~/features/events/domain/presentation";
import type { CheckinRecord, PaymentRecord } from "~/features/events/domain/types";
import type { AdminSupportLabels } from "~/generated/client/AdminSupport";
import type { AllLabels } from "~/generated/client/all";
import { apiClient, apiErrorMessage } from "~/platform/client/api/client";
import { useQuery } from "~/platform/client/query/use-query";
import type { Locale as DeclaredLocales } from "~/platform/i18n";
import { noticeStyles } from "~/platform/ui/notice-styles";
import { dateTimeFormatter, moneyFormatter } from "~/platform/utils/format";

import RegistrationCards from "./RegistrationCards";

interface AdminSupportProps {
  labels: AdminSupportLabels;
  locale: DeclaredLocales;
}

const getSupport = apiClient.api.admin.events[":eventId"].support.$get;
type SupportResponse = InferResponseType<typeof getSupport, 200>;
export type SupportData = SupportResponse["data"];
type SupportKeyset = NonNullable<SupportResponse["meta"]["keyset"]>;

function paymentFilter(value: string | null): AdminPaymentFilter {
  return value === "paid" || value === "unpaid" ? value : "";
}

function checkinFilter(value: string | null): AdminCheckinFilter {
  return value === "checked_in" || value === "not_checked_in" ? value : "";
}

function paymentDisplay(
  payment: PaymentRecord | null,
  due: number,
  labels: AdminSupportLabels,
): string {
  if (payment !== null) {
    return paymentMethodLabel(payment.method, {
      cash: labels.shared.cash,
      eTransfer: labels.shared.eTransfer,
      other: labels.shared.other,
    });
  }

  return due === 0 ? labels.engineAdmin.notAvailable : labels.engineAdmin.unpaid;
}

const styles = {
  filters: grid({
    gap: "3",
    gridTemplateColumns: { base: "1fr", md: "minmax(0, 2fr) 1fr 1fr auto" },
    alignItems: "end",
  }),
  pager: hstack({
    justifyContent: "space-between",
    alignItems: "center",
    gap: "3",
    paddingBlockStart: "4",
  }),
  actions: wrap({ alignItems: "center", gap: "3" }),
  noticeShell: hstack({ paddingBlockEnd: "4" }),
  dialogHeader: hstack({ justifyContent: "space-between", alignItems: "center", gap: "4" }),
};

function parseFilters(): AdminSupportFilters {
  const params = new URLSearchParams(globalThis.location.search);

  return {
    query: (params.get("q") ?? "").trim().slice(0, MAX_REGISTRATION_SEARCH_QUERY_LENGTH),
    payment: paymentFilter(params.get("payment")),
    checkin: checkinFilter(params.get("checkin")),
    before: params.get("before") ?? "",
    after: params.get("after") ?? "",
  };
}

function filterParams(filters: AdminSupportFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.query.length > 0) {
    params.set("q", filters.query);
  }
  if (filters.payment.length > 0) {
    params.set("payment", filters.payment);
  }
  if (filters.checkin.length > 0) {
    params.set("checkin", filters.checkin);
  }
  if (filters.before.length > 0) {
    params.set("before", filters.before);
  }
  if (filters.after.length > 0) {
    params.set("after", filters.after);
  }

  return params;
}

function Pager({
  data,
  keyset,
  locale,
  labels,
}: {
  data: SupportData;
  keyset: SupportKeyset;
  locale: DeclaredLocales;
  labels: AdminSupportLabels;
}) {
  const base = filterParams({
    query: data.filters.query,
    payment: data.filters.payment ?? "",
    checkin: data.filters.checkin ?? "",
    before: "",
    after: "",
  });
  let previous: JSX.Element | null = null;
  let next: JSX.Element | null = null;

  if (keyset.hasPrev && keyset.prevCursor !== null) {
    const previousParams = new URLSearchParams(base);
    previousParams.set("before", keyset.prevCursor);
    previous = (
      <qui-button
        variant="outlined"
        size="sm"
        href={adminEventUrl(locale, {
          view: "support",
          eventId: data.event.id,
          params: previousParams,
        })}
      >
        {labels.engineAdmin.previousPage}
      </qui-button>
    );
  }

  if (keyset.hasNext && keyset.nextCursor !== null) {
    const nextParams = new URLSearchParams(base);
    nextParams.set("after", keyset.nextCursor);
    next = (
      <qui-button
        variant="outlined"
        size="sm"
        href={adminEventUrl(locale, {
          view: "support",
          eventId: data.event.id,
          params: nextParams,
        })}
      >
        {labels.engineAdmin.nextPage}
      </qui-button>
    );
  }

  return (
    <div class={styles.pager}>
      <div class={styles.actions}>
        {previous}
        {next}
      </div>
    </div>
  );
}

function RegistrationResults({
  data,
  keyset,
  locale,
  labels,
  money,
  dateTime,
  eventId,
}: {
  data: SupportData;
  keyset: SupportKeyset;
  locale: DeclaredLocales;
  labels: AdminSupportLabels;
  money: Intl.NumberFormat;
  dateTime: Intl.DateTimeFormat;
  eventId: string;
}): JSX.Element {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<PaymentResult | null>(null);
  const dialogRef = useRef<HTMLQuiDialogElement>(null);

  useEffect((): (() => void) | undefined => {
    const dialog = dialogRef.current;

    if (dialog === null) {
      return undefined;
    }

    dialog.closeOnInteractOutside = false;

    const onOpenChange = (event: Event): void => {
      if (event.target !== dialog) {
        return;
      }

      const detail: unknown = event instanceof CustomEvent ? event.detail : null;

      if (
        typeof detail === "object" &&
        detail !== null &&
        "open" in detail &&
        detail.open === false
      ) {
        setEditingId(null);
      }
    };

    dialog.addEventListener("openchange", onOpenChange);

    return () => {
      dialog.removeEventListener("openchange", onOpenChange);
    };
  }, []);

  if (data.registrations.length === 0) {
    return <p class={tableStyles.empty}>{labels.engineAdmin.noResults}</p>;
  }

  const paymentsById = indexByRegistrationId<PaymentRecord>(data.payments);
  const checkinsById = indexByRegistrationId<CheckinRecord>(data.checkins);
  const editingRegistration = data.registrations.find((item) => item.id === editingId) ?? null;
  const editingPayment =
    editingRegistration === null ? null : (paymentsById.get(editingRegistration.id) ?? null);

  function onResult(result: PaymentResult) {
    setNotice(result);

    if (result.kind !== "failed") {
      setEditingId(null);
    }
  }

  return (
    <>
      <div hidden={notice === null} class={styles.noticeShell}>
        <div
          class={noticeStyles.notice}
          role={notice?.tone === "error" ? "alert" : "status"}
          data-tone={notice?.tone === "error" ? "error" : undefined}
        >
          {notice?.message}
        </div>
      </div>

      <table class={tableStyles.responsiveTable}>
        <thead>
          <tr>
            <th class={tableStyles.th}>{labels.shared.name}</th>
            <th class={tableStyles.th}>{labels.engineAdmin.contact}</th>
            <th class={tableStyles.th}>{labels.engineAdmin.ticketsTotal}</th>
            <th class={tableStyles.th}>{labels.shared.amountDue}</th>
            <th class={tableStyles.th}>{labels.shared.payment}</th>
            <th class={tableStyles.th}>{labels.engineAdmin.checkinFilter}</th>
            <th class={tableStyles.th}>{labels.shared.created}</th>
            <th class={tableStyles.th}>{labels.shared.qRCode}</th>
          </tr>
        </thead>
        <tbody>
          {data.registrations.map((registration) => {
            const due = registrationAmountDue(registration);
            const payment = paymentsById.get(registration.id) ?? null;
            const checkin = checkinsById.get(registration.id) ?? null;
            const qr = adminEventUrl(locale, {
              view: "qr",
              eventId,
              params: new URLSearchParams({ registration: registration.id }),
            });

            return (
              <tr key={registration.id}>
                <td class={tableStyles.td}>
                  <a
                    class={tableStyles.link}
                    aria-label={registration.fullName}
                    href={adminEventUrl(locale, {
                      view: "registration",
                      eventId,
                      params: new URLSearchParams({ registration: registration.id }),
                    })}
                  >
                    <strong>{registration.fullName}</strong>
                  </a>
                  <p class={tableStyles.note}>
                    <code class={tableStyles.code}>{registration.id}</code>
                  </p>
                </td>
                <td class={tableStyles.td}>
                  {registration.contacts.map((contact) => (
                    <div key={contact.id}>{contactDisplay(contact)}</div>
                  ))}
                </td>
                <td class={tableStyles.td}>{ticketSummary(registration.tickets)}</td>
                <td class={tableStyles.td}>{money.format(due / 100)}</td>
                <td class={tableStyles.td}>
                  {paymentDisplay(payment, due, labels)}
                  {due === 0 && payment === null ? null : (
                    <p class={tableStyles.note}>
                      <button
                        type="button"
                        class={tableStyles.link}
                        onClick={() => {
                          setEditingId(registration.id);
                        }}
                      >
                        {payment === null
                          ? labels.engineAdmin.confirmPayment
                          : labels.engineAdmin.updatePayment}
                      </button>
                    </p>
                  )}
                </td>
                <td class={tableStyles.td}>
                  {checkin === null
                    ? labels.engineAdmin.notAvailable
                    : dateTime.format(new Date(checkin.checkedInAt))}
                </td>
                <td class={tableStyles.td}>{dateTime.format(new Date(registration.createdAt))}</td>
                <td class={tableStyles.td}>
                  <a class={tableStyles.link} href={qr}>
                    {labels.shared.qRCode}
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <RegistrationCards
        data={data}
        locale={locale}
        labels={labels as AllLabels}
        money={money}
        dateTime={dateTime}
        eventId={eventId}
        paymentText={(payment, due) => paymentDisplay(payment, due, labels)}
        onEdit={(id) => {
          setEditingId(id);
        }}
      />

      <Pager data={data} keyset={keyset} locale={locale} labels={labels} />

      <qui-dialog ref={dialogRef} open={editingRegistration !== null}>
        <qui-dialog-content>
          <div class={styles.dialogHeader}>
            <qui-dialog-title>
              {editingPayment === null
                ? labels.engineAdmin.confirmPayment
                : labels.engineAdmin.updatePayment}
            </qui-dialog-title>
            <qui-dialog-close
              onClick={() => {
                setEditingId(null);
              }}
            >
              <qui-icon
                label={labels.engineAdmin.userClose}
                path="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
              />
            </qui-dialog-close>
          </div>
          {editingRegistration === null ? null : (
            <PaymentForm
              key={editingRegistration.id}
              eventId={eventId}
              registrationId={editingRegistration.id}
              payment={editingPayment}
              labels={labels}
              onResult={onResult}
            />
          )}
        </qui-dialog-content>
      </qui-dialog>
    </>
  );
}

export default function AdminSupport({ locale, labels }: AdminSupportProps): JSX.Element {
  const [eventId, setEventId] = useState<string | null | undefined>();
  const [filters, setFilters] = useState<AdminSupportFilters | null>(null);
  const [queryValue, setQueryValue] = useState("");
  const [paymentValue, setPaymentValue] = useState<AdminPaymentFilter>("");
  const [checkinValue, setCheckinValue] = useState<AdminCheckinFilter>("");

  useEffect(() => {
    setEventId(new URLSearchParams(globalThis.location.search).get("event"));
    setFilters(parseFilters());
  }, []);

  useEffect(() => {
    if (filters === null) {
      return;
    }

    setQueryValue(filters.query);
    setPaymentValue(filters.payment);
    setCheckinValue(filters.checkin);
  }, [filters]);

  const { data, error, loading } = useQuery(
    eventId == null || filters === null ? null : adminQueries.support(eventId, filters),
  );
  const payload = data?.data ?? null;
  const keyset = data?.meta.keyset ?? null;

  useEffect(() => {
    if (eventId == null) {
      return;
    }

    for (const link of document.querySelectorAll<HTMLElement>("[data-event-link]")) {
      const view = link.dataset.eventLink ?? "";
      link.setAttribute("href", adminEventUrl(locale, { view, eventId }));
    }
  }, [eventId, locale]);

  useEffect(() => {
    if (payload === null) {
      return;
    }

    const title = localized(payload.event.title, locale, "");

    document.title = `${labels.shared.registrationSupport}: ${title}`;
  }, [payload, locale, labels]);

  if (eventId === null) {
    return <p class={tableStyles.error}>{labels.engineAdmin.eventNotFound}</p>;
  }

  if (eventId === undefined || filters === null || loading) {
    return <p class={tableStyles.note}>…</p>;
  }

  function search(event?: Event): void {
    event?.preventDefault();

    const next: AdminSupportFilters = {
      query: queryValue.trim().slice(0, MAX_REGISTRATION_SEARCH_QUERY_LENGTH),
      payment: paymentValue,
      checkin: checkinValue,
      before: "",
      after: "",
    };
    const params = filterParams(next);
    const url = new URL(globalThis.location.href);
    params.set("event", eventId ?? "");
    url.search = params.toString();
    void navigate(url.toString());
  }

  function clearFilters(): void {
    const url = new URL(globalThis.location.href);
    url.search = new URLSearchParams({ event: eventId ?? "" }).toString();
    void navigate(url.toString());
  }

  const money = payload === null ? null : moneyFormatter(locale, payload.event.limits.currency);
  const dateTime = payload === null ? null : dateTimeFormatter(locale, payload.event.timezone);
  const view =
    payload !== null && keyset !== null && money !== null && dateTime !== null
      ? { payload, keyset, money, dateTime }
      : null;

  return (
    <>
      <form class={styles.filters} method="get" onSubmit={search}>
        <input type="hidden" name="event" value={eventId} />
        <qui-field class={adminStyles.field}>
          <qui-field-label>{labels.engineAdmin.search}</qui-field-label>
          <qui-input
            id="engine-support-query"
            name="q"
            maxLength={MAX_REGISTRATION_SEARCH_QUERY_LENGTH}
            placeholder={labels.engineAdmin.searchPlaceholder}
            defaultValue={filters.query}
            onvaluechange={(event) => {
              setQueryValue(event.detail.value);
            }}
          />
        </qui-field>
        <qui-field class={adminStyles.field}>
          <qui-field-label>{labels.shared.payment}</qui-field-label>
          <qui-select
            id="engine-support-payment"
            name="payment"
            defaultValue={[filters.payment]}
            onvaluechange={(event) => {
              setPaymentValue(paymentFilter(event.detail.value[0] ?? ""));
            }}
          >
            <qui-option value="">{labels.engineAdmin.all}</qui-option>
            <qui-option value="paid">{labels.engineAdmin.paid}</qui-option>
            <qui-option value="unpaid">{labels.engineAdmin.unpaid}</qui-option>
          </qui-select>
        </qui-field>
        <qui-field class={adminStyles.field}>
          <qui-field-label>{labels.engineAdmin.checkinFilter}</qui-field-label>
          <qui-select
            id="engine-support-checkin"
            name="checkin"
            defaultValue={[filters.checkin]}
            onvaluechange={(event) => {
              setCheckinValue(checkinFilter(event.detail.value[0] ?? ""));
            }}
          >
            <qui-option value="">{labels.engineAdmin.all}</qui-option>
            <qui-option value="checked_in">{labels.shared.checkedIn}</qui-option>
            <qui-option value="not_checked_in">{labels.shared.notCheckedIn}</qui-option>
          </qui-select>
        </qui-field>
        <div class={styles.actions}>
          <qui-button type="button" variant="filled" onClick={search}>
            {labels.engineAdmin.searchAction}
          </qui-button>
          <qui-button type="button" variant="outlined" onClick={clearFilters}>
            {labels.shared.clear}
          </qui-button>
        </div>
      </form>

      <p class={tableStyles.note}>
        {labels.engineAdmin.results}: {payload?.registrations.length ?? 0}
        {keyset?.hasNext === true ? "+" : ""}
      </p>

      {error !== null && payload === null ? (
        <p class={tableStyles.error}>{apiErrorMessage(error, labels.engineAdmin.loadFailed)}</p>
      ) : null}

      {view === null ? null : (
        <RegistrationResults
          data={view.payload}
          keyset={view.keyset}
          locale={locale}
          labels={labels}
          money={view.money}
          dateTime={view.dateTime}
          eventId={eventId}
        />
      )}
    </>
  );
}
