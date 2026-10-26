// @boundary client
import { navigate } from "astro:transitions/client";
/* oxlint-disable eslint/max-lines-per-function -- Support keeps filters, results, and paging in one workflow. */
import { type InferResponseType } from "hono/client";
import { type JSX } from "preact";
import { useEffect, useState } from "preact/hooks";

import { css } from "styled-system/css";
import { grid, hstack, wrap } from "styled-system/patterns";
import {
  adminQueries,
  type AdminCheckinFilter,
  type AdminPaymentFilter,
  type AdminSupportFilters,
} from "~/events/admin/ui/shared/queries";
import { adminEventUrl } from "~/events/admin/ui/shared/routes";
import { adminStyles } from "~/events/admin/ui/shared/styles/admin-styles";
import { tableStyles } from "~/events/admin/ui/shared/table";
import { MAX_REGISTRATION_SEARCH_QUERY_LENGTH } from "~/events/domain/limits";
import { localized } from "~/events/domain/localized";
import {
  contactDisplay,
  indexByRegistrationId,
  registrationAmountDue,
  registrationPaymentStatusText,
} from "~/events/domain/presentation";
import { type CheckinRecord, type PaymentRecord } from "~/events/domain/types";
import { type ApiPagination } from "~/shared/api/response";
import { apiClient, apiErrorMessage } from "~/shared/client/api/client";
import { useQuery } from "~/shared/client/query/use-query";
import { dateTimeFormatter, moneyFormatter } from "~/shared/utils/format";

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
  otherPayment: string;
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

const getSupport = apiClient.api.admin.events[":eventId"].support.$get;
type SupportResponse = InferResponseType<typeof getSupport, 200>;
type SupportData = SupportResponse["data"];

type RequestedFilters = AdminSupportFilters;

function paymentFilter(value: string | null): AdminPaymentFilter {
  return value === "paid" || value === "unpaid" ? value : "";
}

function checkinFilter(value: string | null): AdminCheckinFilter {
  return value === "checked_in" || value === "not_checked_in" ? value : "";
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
  note: css({ fontSize: "xs", color: "onSurfaceVariant" }),
};

function paymentMethodLabel(method: string, config: AdminSupportConfig): string {
  if (method === "cash") {
    return config.cashPayment;
  }

  return method === "etransfer" ? config.etransferPayment : config.otherPayment;
}

function parseFilters(): RequestedFilters {
  const params = new URLSearchParams(globalThis.location.search);
  const page = Math.trunc(Number(params.get("page") ?? "1"));

  return {
    query: (params.get("q") ?? "").trim().slice(0, 40),
    payment: paymentFilter(params.get("payment")),
    checkin: checkinFilter(params.get("checkin")),
    page: Math.max(1, Number.isFinite(page) ? page : 1),
  };
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

function Pager(props: {
  data: SupportData;
  pagination: ApiPagination;
  config: AdminSupportConfig;
}): JSX.Element {
  const filters = filterParams({
    query: props.data.filters.query,
    payment: props.data.filters.payment ?? "",
    checkin: props.data.filters.checkin ?? "",
    page: props.pagination.page,
  });
  const [before = "", between = "", after = ""] = props.config.pageOfParts;
  let previous: JSX.Element | null = null;
  let next: JSX.Element | null = null;

  if (props.pagination.page > 1) {
    const previousParams = new URLSearchParams(filters);
    previousParams.set("page", String(props.pagination.page - 1));
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

  if (props.pagination.page < props.pagination.totalPages) {
    const nextParams = new URLSearchParams(filters);
    nextParams.set("page", String(props.pagination.page + 1));
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
        {props.pagination.page}
        {between}
        {props.pagination.totalPages}
        {after}
      </span>
    </div>
  );
}

export default function AdminSupport(props: { config: AdminSupportConfig }): JSX.Element {
  const [eventId, setEventId] = useState<string | null | undefined>();
  const [filters, setFilters] = useState<RequestedFilters | null>(null);
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
  const pagination = data?.meta.pagination ?? null;

  useEffect(() => {
    if (eventId == null) {
      return;
    }

    for (const link of document.querySelectorAll<HTMLElement>("[data-event-link]")) {
      const view = link.dataset.eventLink ?? "";
      link.setAttribute("href", adminEventUrl(props.config.locale, { view, eventId }));
    }
  }, [eventId, props.config.locale]);

  useEffect(() => {
    if (payload === null) {
      return;
    }

    const title = localized(payload.event.title, props.config.locale, "");

    document.title = `${props.config.support}: ${title}`;
  }, [payload, props.config]);

  if (eventId === null) {
    return <p class={tableStyles.error}>{props.config.eventNotFound}</p>;
  }

  if (eventId === undefined || filters === null || loading) {
    return <p class={styles.note}>…</p>;
  }

  function search(event?: Event): void {
    event?.preventDefault();

    const next: RequestedFilters = {
      query: queryValue.trim().slice(0, 40),
      payment: paymentValue,
      checkin: checkinValue,
      page: 1,
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

  const money =
    payload === null ? null : moneyFormatter(props.config.locale, payload.event.limits.currency);
  const dateTime =
    payload === null ? null : dateTimeFormatter(props.config.locale, payload.event.timezone);
  const paymentsById: Map<string, PaymentRecord> =
    payload === null
      ? new Map<string, PaymentRecord>()
      : indexByRegistrationId<PaymentRecord>(payload.payments);
  const checkinsById: Map<string, CheckinRecord> =
    payload === null
      ? new Map<string, CheckinRecord>()
      : indexByRegistrationId<CheckinRecord>(payload.checkins);

  return (
    <>
      <form class={styles.filters} method="get" onSubmit={search}>
        <input type="hidden" name="event" value={eventId} />
        <qui-field class={adminStyles.field}>
          <qui-field-label>{props.config.search}</qui-field-label>
          <qui-input
            id="engine-support-query"
            name="q"
            maxLength={MAX_REGISTRATION_SEARCH_QUERY_LENGTH}
            placeholder={props.config.searchPlaceholder}
            defaultValue={filters.query}
            onvaluechange={(event) => {
              setQueryValue(event.detail.value);
            }}
          />
        </qui-field>
        <qui-field class={adminStyles.field}>
          <qui-field-label>{props.config.paymentFilter}</qui-field-label>
          <qui-select
            id="engine-support-payment"
            name="payment"
            defaultValue={[filters.payment]}
            onvaluechange={(event) => {
              setPaymentValue(paymentFilter(event.detail.value[0] ?? ""));
            }}
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
            defaultValue={[filters.checkin]}
            onvaluechange={(event) => {
              setCheckinValue(checkinFilter(event.detail.value[0] ?? ""));
            }}
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
        {props.config.results}: {pagination?.total ?? 0}
      </p>

      {error !== null && payload === null ? (
        <p class={tableStyles.error}>{apiErrorMessage(error, props.config.loadFailed)}</p>
      ) : null}

      {payload !== null &&
      pagination !== null &&
      money !== null &&
      dateTime !== null &&
      payload.registrations.length === 0 ? (
        <p class={tableStyles.empty}>{props.config.noResults}</p>
      ) : null}

      {payload !== null &&
      pagination !== null &&
      money !== null &&
      dateTime !== null &&
      payload.registrations.length > 0 ? (
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
              {payload.registrations.map((registration) => {
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
                        {registrationPaymentStatusText(payment, due, props.config)}
                      </span>
                      {payment === null ? null : (
                        <p class={tableStyles.note}>
                          {paymentMethodLabel(payment.method, props.config)}
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
          <Pager data={payload} pagination={pagination} config={props.config} />
        </>
      ) : null}
    </>
  );
}
