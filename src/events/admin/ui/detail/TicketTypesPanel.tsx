// @boundary client
import type { DeclaredLocales } from "intlayer";
import type { JSX } from "preact";

import { adminEventUrl } from "~/events/admin/ui/shared/routes";
import { formatMoney } from "~/shared/utils/format";

import { styles } from "./admin-detail-styles";
import type { AdminDetailValues, EventDetail } from "./admin-detail-types";

export function TicketTypesPanel({
  locale,
  labels,
  current,
}: {
  locale: DeclaredLocales;
  labels: AdminDetailValues;
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
        <h2 class={styles.cardTitle}>{labels.ticketTypes}</h2>
        <qui-button
          href={adminEventUrl(locale, {
            view: "ticket-type/new",
            eventId: current.id,
          })}
          variant="outlined"
          size="sm"
        >
          {labels.addTicketType}
        </qui-button>
      </div>
      {current.ticketTypes.length === 0 ? (
        <p class={styles.empty}>{labels.noTicketTypes}</p>
      ) : (
        <>
          <table class={styles.table}>
            <thead>
              <tr>
                <th class={styles.th}>Key</th>
                <th class={styles.th}>{labels.status}</th>
                <th class={styles.th}>{labels.price}</th>
                <th class={styles.th}>{labels.minMax}</th>
                <th class={styles.th}>{labels.capacity}</th>
                <th class={styles.th}>{labels.remaining}</th>
                <th class={styles.th}>{labels.edit}</th>
              </tr>
            </thead>
            <tbody>
              {current.ticketTypes.map((ticket) => (
                <tr key={ticket.key}>
                  <td class={styles.td}>{ticket.key}</td>
                  <td class={styles.td}>
                    <span class={styles.badge}>
                      {ticket.active ? labels.active : labels.archived}
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
                      {labels.edit}
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
                    {labels.edit}
                  </a>
                </div>
                <div class={styles.ticketCardGrid}>
                  <div>
                    <span class={styles.ticketCardLabel}>{labels.status}</span>
                    <span class={`${styles.ticketCardValue} ${styles.badge}`}>
                      {ticket.active ? labels.active : labels.archived}
                    </span>
                  </div>
                  <div>
                    <span class={styles.ticketCardLabel}>{labels.price}</span>
                    <span class={styles.ticketCardValue}>
                      {formatMoney(ticket.priceMinor, locale, current.limits.currency)}
                    </span>
                  </div>
                  <div>
                    <span class={styles.ticketCardLabel}>{labels.minMax}</span>
                    <span class={styles.ticketCardValue}>
                      {ticket.minPerRegistration} / {ticket.maxPerRegistration ?? "∞"}
                    </span>
                  </div>
                  <div>
                    <span class={styles.ticketCardLabel}>{labels.capacity}</span>
                    <span class={styles.ticketCardValue}>{ticket.capacity ?? "∞"}</span>
                  </div>
                  <div>
                    <span class={styles.ticketCardLabel}>{labels.remaining}</span>
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
