/* oxlint-disable eslint/max-lines-per-function -- Support keeps filters, results, and paging in one workflow. */
import type { JSX } from "preact";
import { useEffect, useState } from "preact/hooks";

import { css } from "styled-system/css";
import { grid, hstack, wrap } from "styled-system/patterns";
import { tableStyles } from "~/events/admin/islands/shared/table";
import { localized } from "~/events/domain/localized";
import {
  contactDisplay,
  indexByRegistrationId,
  registrationAmountDue,
} from "~/events/domain/presentation";
import type { CheckinRecord, PaymentRecord, RegistrationRecord } from "~/events/domain/types";
import { apiErrorMessage } from "~/shared/client/api";
import { readFormValue } from "~/shared/client/form-controls";
import { useCachedJson } from "~/shared/client/use-cached-json";
import { dateTimeFormatter, moneyFormatter } from "~/shared/utils/format";

import { adminEventUrl } from "../islands/shared/routes";
import { adminStyles } from "./styles/admin-styles";

export interface AdminSupportConfig {
  locale: string;
  support: string;
  results: string;
  noResults: string;
  fullName: string;
  contact: string;
  ticketsTotal: string;
  amountDue: string;
  paymentStatus: string;
  checkinFilter: string;
  createdAt: string;
  qrCode: string;
  paid: string;
  unpaid: string;
  checkedIn: string;
  notCheckedIn: string;
  noPaymentRequired: string;
  cashPayment: string;
  etransferPayment: string;
  previousPage: string;
  nextPage: string;
  pageOfParts: string[];
  loadFailed: string;
  forbidden: string;
  eventNotFound: string;
  search: string;
  searchPlaceholder: string;
  paymentFilter: string;
  all: string;
  searchAction: string;
  clearFilters: string;
}

interface SupportResponse {
  event: {
    id: string;
    title: Record<string, string>;
    timezone: string;
    limits: { currency: string };
  };
  registrations: RegistrationRecord[];
  payments: PaymentRecord[];
  checkins: CheckinRecord[];
  page: number;
  total: number;
  totalPages: number;
  filters: { query: string; payment: string | null; checkin: string | null };
}

interface RequestedFilters {
  query: string;
  payment: string;
  checkin: string;
  page: number;
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
    marginBlockStart: "4",
  }),
  actions: wrap({ alignItems: "center", gap: "3" }),
  note: css({ margin: "0", fontSize: "xs", color: "onSurfaceVariant" }),
};

function paymentStatusText(
  payment: PaymentRecord | null,
  due: number,
  config: AdminSupportConfig,
): string {
  if (payment !== null) {
    return config.paid;
  }
  return due === 0 ? config.noPaymentRequired : config.unpaid;
}

function parseFilters(): RequestedFilters {
  const params = new URLSearchParams(globalThis.location.search);
  const page = Math.trunc(Number(params.get("page") ?? "1"));

  return {
    query: (params.get("q") ?? "").trim().slice(0, 40),
    payment: params.get("payment") ?? "",
    checkin: params.get("checkin") ?? "",
    page: Math.max(1, Number.isFinite(page) ? page : 1),
  };
}

function formFromEvent(event: Event | undefined): HTMLFormElement | null {
  const target = event?.currentTarget;

  if (target instanceof HTMLFormElement) {
    return target;
  }

  if (target instanceof HTMLElement) {
    return target.closest("form");
  }

  return document.querySelector<HTMLFormElement>("form");
}

function filterParams(filters: RequestedFilters): URLSearchParams {
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

  return params;
}

function Pager(props: { data: SupportResponse; config: AdminSupportConfig }): JSX.Element {
  const filters = filterParams({
    query: props.data.filters.query,
    payment: props.data.filters.payment ?? "",
    checkin: props.data.filters.checkin ?? "",
    page: props.data.page,
  });
  const [before = "", between = "", after = ""] = props.config.pageOfParts;
  let previous: JSX.Element | null = null;
  let next: JSX.Element | null = null;

  if (props.data.page > 1) {
    const previousParams = new URLSearchParams(filters);
    previousParams.set("page", String(props.data.page - 1));
    previous = (
      <qui-button
        variant="outlined"
        size="sm"
        href={adminEventUrl(props.config.locale, {
          view: "support",
          eventId: props.data.event.id,
          params: previousParams,
        })}
      >
        {props.config.previousPage}
      </qui-button>
    );
  }

  if (props.data.page < props.data.totalPages) {
    const nextParams = new URLSearchParams(filters);
    nextParams.set("page", String(props.data.page + 1));
    next = (
      <qui-button
        variant="outlined"
        size="sm"
        href={adminEventUrl(props.config.locale, {
          view: "support",
          eventId: props.data.event.id,
          params: nextParams,
        })}
      >
        {props.config.nextPage}
      </qui-button>
    );
  }

  return (
    <div class={styles.pager}>
      <div class={styles.actions}>
        {previous}
        {next}
      </div>
      <span class={styles.note}>
        {before}
        {props.data.page}
        {between}
        {props.data.totalPages}
        {after}
      </span>
    </div>
  );
}

export default function AdminSupport(props: { config: AdminSupportConfig }): JSX.Element {
  const [eventId, setEventId] = useState<string | null | undefined>();
  const [filters, setFilters] = useState<RequestedFilters | null>(null);

  useEffect(() => {
    setEventId(new URLSearchParams(globalThis.location.search).get("event"));
    setFilters(parseFilters());

    const handlePopState = (): void => {
      setEventId(new URLSearchParams(globalThis.location.search).get("event"));
      setFilters(parseFilters());
    };

    globalThis.addEventListener("popstate", handlePopState);

    return (): void => {
      globalThis.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const apiParams = filters === null ? null : filterParams(filters);
  apiParams?.set("page", String(filters?.page ?? 1));
  const api =
    eventId === undefined || eventId === null || filters === null || apiParams === null
      ? null
      : `/api/events/admin/events/${encodeURIComponent(eventId)}/support?${apiParams.toString()}`;
  const { data, error, loading } = useCachedJson<SupportResponse>(api);

  useEffect(() => {
    if (eventId === undefined || eventId === null) {
      return;
    }

    const detailUrl = adminEventUrl(props.config.locale, { eventId });
    const back = document.querySelector<HTMLAnchorElement>("#engine-support-back");

    if (back !== null) {
      back.href = detailUrl;
    }

    for (const link of document.querySelectorAll<HTMLElement>("[data-event-link]")) {
      const view = link.dataset.eventLink ?? "";
      link.setAttribute("href", adminEventUrl(props.config.locale, { view, eventId }));
    }
  }, [eventId, props.config.locale]);

  useEffect(() => {
    if (filters === null) {
      return;
    }

    const query = document.querySelector<HTMLQuiInputElement>("#engine-support-query");
    const payment = document.querySelector<HTMLQuiSelectElement>("#engine-support-payment");
    const checkin = document.querySelector<HTMLQuiSelectElement>("#engine-support-checkin");

    if (query !== null) {
      query.value = filters.query;
    }
    if (payment !== null) {
      payment.value = [filters.payment];
    }
    if (checkin !== null) {
      checkin.value = [filters.checkin];
    }
  }, [filters]);

  useEffect(() => {
    if (data === null) {
      return;
    }

    const title = localized(data.event.title, props.config.locale, "");
    const heading = document.querySelector<HTMLElement>("#engine-support-title");

    if (heading !== null) {
      heading.textContent = title;
    }

    document.title = `${props.config.support}: ${title}`;
  }, [data, props.config]);

  if (eventId === null) {
    return <p class={tableStyles.error}>{props.config.eventNotFound}</p>;
  }

  if (eventId === undefined || filters === null || loading) {
    return <p class={styles.note}>…</p>;
  }

  function search(event?: Event): void {
    event?.preventDefault();
    const form = formFromEvent(event);

    if (form === null) {
      return;
    }

    const next: RequestedFilters = {
      query: readFormValue(form, "q").trim().slice(0, 40),
      payment: readFormValue(form, "payment"),
      checkin: readFormValue(form, "checkin"),
      page: 1,
    };
    const params = filterParams(next);
    const url = new URL(globalThis.location.href);
    params.set("event", eventId ?? "");
    url.search = params.toString();
    globalThis.history.pushState({}, "", url.toString());
    setFilters(next);
  }

  function clearFilters(): void {
    const next: RequestedFilters = {
      query: "",
      payment: "",
      checkin: "",
      page: 1,
    };
    const params = filterParams(next);
    const url = new URL(globalThis.location.href);
    params.set("event", eventId ?? "");
    url.search = params.toString();
    globalThis.history.pushState({}, "", url.toString());
    setFilters(next);
  }

  const money =
    data === null ? null : moneyFormatter(props.config.locale, data.event.limits.currency);
  const dateTime =
    data === null ? null : dateTimeFormatter(props.config.locale, data.event.timezone);
  const paymentsById: Map<string, PaymentRecord> =
    data === null
      ? new Map<string, PaymentRecord>()
      : indexByRegistrationId<PaymentRecord>(data.payments);
  const checkinsById: Map<string, CheckinRecord> =
    data === null
      ? new Map<string, CheckinRecord>()
      : indexByRegistrationId<CheckinRecord>(data.checkins);

  return (
    <>
      <form class={styles.filters} method="get" onSubmit={search}>
        <input type="hidden" name="event" value={eventId} />
        <qui-field class={adminStyles.field}>
          <qui-field-label>{props.config.search}</qui-field-label>
          <qui-input
            id="engine-support-query"
            name="q"
            max-length={40}
            placeholder={props.config.searchPlaceholder}
            default-value={filters.query}
          />
        </qui-field>
        <qui-field class={adminStyles.field}>
          <qui-field-label>{props.config.paymentFilter}</qui-field-label>
          <qui-select
            id="engine-support-payment"
            name="payment"
            default-value={JSON.stringify([filters.payment])}
          >
            <qui-option value="">{props.config.all}</qui-option>
            <qui-option value="paid">{props.config.paid}</qui-option>
            <qui-option value="unpaid">{props.config.unpaid}</qui-option>
          </qui-select>
        </qui-field>
        <qui-field class={adminStyles.field}>
          <qui-field-label>{props.config.checkinFilter}</qui-field-label>
          <qui-select
            id="engine-support-checkin"
            name="checkin"
            default-value={JSON.stringify([filters.checkin])}
          >
            <qui-option value="">{props.config.all}</qui-option>
            <qui-option value="checked_in">{props.config.checkedIn}</qui-option>
            <qui-option value="not_checked_in">{props.config.notCheckedIn}</qui-option>
          </qui-select>
        </qui-field>
        <div class={styles.actions}>
          <qui-button type="button" variant="filled" onClick={search}>
            {props.config.searchAction}
          </qui-button>
          <qui-button type="button" variant="outlined" onClick={clearFilters}>
            {props.config.clearFilters}
          </qui-button>
        </div>
      </form>

      <p class={styles.note}>
        {props.config.results}: {data?.total ?? 0}
      </p>

      {error !== null && data === null ? (
        <p class={tableStyles.error}>
          {apiErrorMessage(error, {
            loadFailed: props.config.loadFailed,
            forbidden: props.config.forbidden,
            notFound: props.config.eventNotFound,
          })}
        </p>
      ) : null}

      {data !== null && money !== null && dateTime !== null && data.registrations.length === 0 ? (
        <p class={tableStyles.empty}>{props.config.noResults}</p>
      ) : null}

      {data !== null && money !== null && dateTime !== null && data.registrations.length > 0 ? (
        <>
          <table class={tableStyles.table}>
            <thead>
              <tr>
                <th class={tableStyles.th}>{props.config.fullName}</th>
                <th class={tableStyles.th}>{props.config.contact}</th>
                <th class={tableStyles.th}>{props.config.ticketsTotal}</th>
                <th class={tableStyles.th}>{props.config.amountDue}</th>
                <th class={tableStyles.th}>{props.config.paymentStatus}</th>
                <th class={tableStyles.th}>{props.config.checkinFilter}</th>
                <th class={tableStyles.th}>{props.config.createdAt}</th>
                <th class={tableStyles.th}>{props.config.qrCode}</th>
              </tr>
            </thead>
            <tbody>
              {data.registrations.map((registration) => {
                const due = registrationAmountDue(registration);
                const payment = paymentsById.get(registration.id) ?? null;
                const checkin = checkinsById.get(registration.id) ?? null;
                const qr = adminEventUrl(props.config.locale, {
                  view: "qr",
                  eventId,
                  params: new URLSearchParams({
                    event: eventId,
                    registration: registration.id,
                  }),
                });
                return (
                  <tr key={registration.id}>
                    <td class={tableStyles.td}>
                      <strong>{registration.fullName}</strong>
                      <p class={tableStyles.note}>
                        <code class={tableStyles.code}>{registration.id}</code>
                      </p>
                    </td>
                    <td class={tableStyles.td}>
                      {registration.contacts.map((contact) => (
                        <div key={contact.id}>{contactDisplay(contact)}</div>
                      ))}
                    </td>
                    <td class={tableStyles.td}>
                      {registration.tickets
                        .map((ticket) => `${ticket.key} × ${ticket.quantity}`)
                        .join(", ")}
                    </td>
                    <td class={tableStyles.td}>{money.format(due / 100)}</td>
                    <td class={tableStyles.td}>
                      <span class={tableStyles.badge}>
                        {paymentStatusText(payment, due, props.config)}
                      </span>
                      {payment === null ? null : (
                        <p class={tableStyles.note}>
                          {payment.method === "cash"
                            ? props.config.cashPayment
                            : props.config.etransferPayment}{" "}
                          · {money.format(payment.amountMinor / 100)}
                        </p>
                      )}
                    </td>
                    <td class={tableStyles.td}>
                      <span class={tableStyles.badge}>
                        {checkin === null ? props.config.notCheckedIn : props.config.checkedIn}
                      </span>
                      {checkin === null ? null : (
                        <p class={tableStyles.note}>
                          {dateTime.format(new Date(checkin.checkedInAt))}
                        </p>
                      )}
                    </td>
                    <td class={tableStyles.td}>
                      {dateTime.format(new Date(registration.createdAt))}
                    </td>
                    <td class={tableStyles.td}>
                      <a class={tableStyles.link} href={qr}>
                        {props.config.qrCode}
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pager data={data} config={props.config} />
        </>
      ) : null}
    </>
  );
}
