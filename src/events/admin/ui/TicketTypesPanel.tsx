import type { JSX } from "preact";

import { adminEventUrl } from "~/events/admin/islands/shared/routes";
import { formatMoney } from "~/shared/utils/format";

import { styles } from "./admin-detail-styles";
import type { AdminEventDetailMessages, EventDetail } from "./admin-detail-types";

export function TicketTypesPanel(props: {
  locale: string;
  messages: AdminEventDetailMessages;
  current: EventDetail;
}): JSX.Element {
  const current = props.current;

  return (
    <div class={styles.panel}>
      <div class={styles.panelHeading}>
        <h2 class={styles.cardTitle}>{props.messages.ticketTypes}</h2>
        <qui-button
          href={adminEventUrl(props.locale, {
            view: "ticket-type/new",
            eventId: current.id,
          })}
          variant="outlined"
          size="sm"
        >
          {props.messages.addTicketType}
        </qui-button>
      </div>
      {current.ticketTypes.length > 0 ? (
        <table class={styles.table}>
          <thead>
            <tr>
              <th class={styles.th}>Key</th>
              <th class={styles.th}>{props.messages.status}</th>
              <th class={styles.th}>{props.messages.price}</th>
              <th class={styles.th}>{props.messages.minMax}</th>
              <th class={styles.th}>{props.messages.capacity}</th>
              <th class={styles.th}>{props.messages.remaining}</th>
              <th class={styles.th}>{props.messages.edit}</th>
            </tr>
          </thead>
          <tbody>
            {current.ticketTypes.map((ticket) => (
              <tr key={ticket.key}>
                <td class={styles.td}>{ticket.key}</td>
                <td class={styles.td}>
                  <span class={styles.badge}>
                    {ticket.active ? props.messages.active : props.messages.archived}
                  </span>
                </td>
                <td class={styles.td}>
                  {formatMoney(ticket.priceMinor, props.locale, current.limits.currency)}
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
                  <a
                    class={styles.link}
                    href={adminEventUrl(props.locale, {
                      view: "ticket-type/edit",
                      eventId: current.id,
                      params: new URLSearchParams({
                        key: ticket.key,
                      }),
                    })}
                  >
                    {props.messages.edit}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p class={styles.empty}>{props.messages.noTicketTypes}</p>
      )}
    </div>
  );
}
