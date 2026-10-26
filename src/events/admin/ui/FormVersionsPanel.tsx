import type { JSX } from "preact";

import { adminEventUrl } from "~/events/admin/islands/shared/routes";

import { styles } from "./admin-detail-styles";
import type { AdminEventDetailMessages, EventDetail, FormVersion } from "./admin-detail-types";
import { formatDateTime } from "./admin-detail-utils";

export function FormVersionsPanel(props: {
  locale: string;
  messages: AdminEventDetailMessages;
  current: EventDetail;
  versions: FormVersion[];
}): JSX.Element {
  const current = props.current;

  return (
    <div class={styles.panel}>
      <div class={styles.panelHeading}>
        <h2 class={styles.cardTitle}>{props.messages.formVersions}</h2>
        <qui-button
          href={adminEventUrl(props.locale, {
            view: "form",
            eventId: current.id,
          })}
          variant="outlined"
          size="sm"
        >
          {props.messages.newForm}
        </qui-button>
      </div>
      {props.versions.length > 0 ? (
        <table class={styles.table}>
          <thead>
            <tr>
              <th class={styles.th}>{props.messages.version}</th>
              <th class={styles.th}>{props.messages.status}</th>
              <th class={styles.th}>{props.messages.createdAt}</th>
              <th class={styles.th}>{props.messages.preview}</th>
              <th class={styles.th}>{props.messages.edit}</th>
            </tr>
          </thead>
          <tbody>
            {props.versions.map((version) => (
              <tr key={version.version}>
                <td class={styles.td}>{version.version}</td>
                <td class={styles.td}>
                  <span class={styles.badge}>{version.status}</span>
                </td>
                <td class={styles.td}>
                  {formatDateTime(version.createdAt, props.locale, current.timezone)}
                </td>
                <td class={styles.td}>
                  <a
                    class={styles.link}
                    href={adminEventUrl(props.locale, {
                      view: "preview",
                      eventId: current.id,
                      params: new URLSearchParams({
                        version: String(version.version),
                      }),
                    })}
                  >
                    {props.messages.preview}
                  </a>
                </td>
                <td class={styles.td}>
                  <a
                    class={styles.link}
                    href={adminEventUrl(props.locale, {
                      view: "form",
                      eventId: current.id,
                      params: new URLSearchParams({
                        version: String(version.version),
                      }),
                    })}
                  >
                    {props.messages.editForm}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p class={styles.empty}>{props.messages.noFormVersions}</p>
      )}
    </div>
  );
}
