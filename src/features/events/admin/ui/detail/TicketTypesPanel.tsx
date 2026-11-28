// @boundary client
import type { InferResponseType } from "hono/client";
import type { JSX } from "preact";

import { adminEventUrl } from "~/features/events/admin/ui/shared/routes";
import type { AdminEventDetailLabels } from "~/generated/client/AdminEventDetail";
import { apiClient } from "~/platform/client/api/client";
import type { Locale as DeclaredLocales } from "~/platform/i18n";
import { formatMoney } from "~/platform/utils/format";

import { styles } from "./admin-detail-styles";

const getOverview = apiClient.api.admin.events[":eventId"].overview.$get;
type EventDetail = InferResponseType<typeof getOverview, 200>["data"]["event"];

export function TicketTypesPanel({
  locale,
  labels,
  current,
}: {
  locale: DeclaredLocales;
  labels: AdminEventDetailLabels;
  current: EventDetail;
}): JSX.Element {
  const editHref = (key: string): string =>
    adminEventUrl(locale, {
      view: "ticket-type/edit",
      eventId: current.id,
      params: new URLSearchParams({ key }),
    });

  return (
    <div class={styles.panel}>
      <div class={styles.panelHeading}>
        <h2 class={styles.cardTitle}>{labels.engineAdmin.ticketTypes}</h2>
        <qui-button
          href={adminEventUrl(locale, {
            view: "ticket-type/new",
            eventId: current.id,
          })}
          variant="outlined"
          size="sm"
        >
          {labels.engineAdmin.addTicketType}
        </qui-button>
      </div>
      {current.ticketTypes.length === 0 ? (
        <p class={styles.empty}>{labels.engineAdmin.noTicketTypes}</p>
      ) : (
        <>
          <table class={styles.table}>
            <thead>
              <tr>
                <th class={styles.th}>Key</th>
                <th class={styles.th}>{labels.engineAdmin.status}</th>
                <th class={styles.th}>{labels.shared.price}</th>
                <th class={styles.th}>{labels.engineAdmin.minMax}</th>
                <th class={styles.th}>{labels.engineAdmin.capacity}</th>
                <th class={styles.th}>{labels.engineAdmin.remaining}</th>
                <th class={styles.th}>{labels.shared.edit}</th>
              </tr>
            </thead>
            <tbody>
              {current.ticketTypes.map((ticket) => (
                <tr key={ticket.key}>
                  <td class={styles.td}>{ticket.key}</td>
                  <td class={styles.td}>
                    <span class={styles.badge}>
                      {ticket.active ? labels.shared.active : labels.shared.archived}
                    </span>
                  </td>
                  <td class={styles.td}>
                    {formatMoney(ticket.priceMinor, locale, current.limits.currency)}
                  </td>
                  <td class={styles.td}>
                    {ticket.minPerRegistration} / {ticket.maxPerRegistration ?? "∞"}
                  </td>
                  <td class={styles.td}>{ticket.capacity ?? "∞"}</td>
                  <td class={styles.td}>
                    {ticket.capacity === null
                      ? "∞"
                      : Math.max(ticket.capacity - ticket.ticketsSold, 0)}
                  </td>
                  <td class={styles.td}>
                    <a class={styles.link} href={editHref(ticket.key)}>
                      {labels.shared.edit}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div class={styles.ticketCards}>
            {current.ticketTypes.map((ticket) => (
              <div class={styles.ticketCard} key={ticket.key}>
                <div class={styles.ticketCardHeader}>
                  <strong class={styles.ticketCardName}>{ticket.key}</strong>
                  <a class={styles.link} href={editHref(ticket.key)}>
                    {labels.shared.edit}
                  </a>
                </div>
                <div class={styles.ticketCardGrid}>
                  <div>
                    <span class={styles.ticketCardLabel}>{labels.engineAdmin.status}</span>
                    <span class={`${styles.ticketCardValue} ${styles.badge}`}>
                      {ticket.active ? labels.shared.active : labels.shared.archived}
                    </span>
                  </div>
                  <div>
                    <span class={styles.ticketCardLabel}>{labels.shared.price}</span>
                    <span class={styles.ticketCardValue}>
                      {formatMoney(ticket.priceMinor, locale, current.limits.currency)}
                    </span>
                  </div>
                  <div>
                    <span class={styles.ticketCardLabel}>{labels.engineAdmin.minMax}</span>
                    <span class={styles.ticketCardValue}>
                      {ticket.minPerRegistration} / {ticket.maxPerRegistration ?? "∞"}
                    </span>
                  </div>
                  <div>
                    <span class={styles.ticketCardLabel}>{labels.engineAdmin.capacity}</span>
                    <span class={styles.ticketCardValue}>{ticket.capacity ?? "∞"}</span>
                  </div>
                  <div>
                    <span class={styles.ticketCardLabel}>{labels.engineAdmin.remaining}</span>
                    <span class={styles.ticketCardValue}>
                      {ticket.capacity === null
                        ? "∞"
                        : Math.max(ticket.capacity - ticket.ticketsSold, 0)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
