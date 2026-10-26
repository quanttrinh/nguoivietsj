/* oxlint-disable eslint/no-nested-ternary, unicorn/no-nested-ternary, eslint/no-negated-condition, unicorn/no-negated-condition -- Direct rendering keeps related state branches together. */
import type { JSX } from "preact";

import { adminEventUrl } from "~/events/admin/islands/shared/routes";

import { styles } from "./admin-detail-styles";
import type {
  AdminEventDetailMessages,
  Checkin,
  EventDetail,
  Registration,
} from "./admin-detail-types";
import { contactText, formatDateTime } from "./admin-detail-utils";

export function RegistrationsPanel(props: {
  locale: string;
  messages: AdminEventDetailMessages;
  current: EventDetail;
  registrations: Registration[];
  checkins: Map<string, Checkin>;
}): JSX.Element {
  const current = props.current;
  const registrations = props.registrations;
  const checkins = props.checkins;

  return (
    <div class={styles.panel}>
      <h2 class={styles.cardTitle}>{props.messages.registrations}</h2>
      {registrations.length > 0 ? (
        <table class={styles.table}>
          <thead>
            <tr>
              <th class={styles.th}>{props.messages.fullName}</th>
              <th class={styles.th}>{props.messages.contact}</th>
              <th class={styles.th}>{props.messages.ticketsTotal}</th>
              <th class={styles.th}>{props.messages.checkedIn}</th>
              <th class={styles.th}>{props.messages.createdAt}</th>
              <th class={styles.th}>{props.messages.qrCode}</th>
            </tr>
          </thead>
          <tbody>
            {registrations.map((registration) => {
              const checkin = checkins.get(registration.id);
              return (
                <tr key={registration.id}>
                  <td class={styles.td}>{registration.fullName}</td>
                  <td class={styles.td}>
                    {registration.contacts.map((contact) => (
                      <div key={contact.id}>{contactText(contact)}</div>
                    ))}
                  </td>
                  <td class={styles.td}>
                    {registration.tickets
                      .map((ticket) => `${ticket.key} × ${ticket.quantity}`)
                      .join(", ")}
                  </td>
                  <td class={styles.td}>
                    {checkin !== undefined ? (
                      <span class={styles.badge}>
                        {props.messages.checkedIn} ·{" "}
                        {formatDateTime(checkin.checkedInAt, props.locale, current.timezone)}
                      </span>
                    ) : (
                      <span class={styles.badge}>{props.messages.notCheckedIn}</span>
                    )}
                  </td>
                  <td class={styles.td}>
                    {formatDateTime(registration.createdAt, props.locale, current.timezone)}
                  </td>
                  <td class={styles.td}>
                    <a
                      class={styles.link}
                      href={adminEventUrl(props.locale, {
                        view: "qr",
                        eventId: current.id,
                        params: new URLSearchParams({
                          registration: registration.id,
                        }),
                      })}
                    >
                      {props.messages.qrCode}
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p class={styles.empty}>{props.messages.noRegistrations}</p>
      )}
    </div>
  );
}
