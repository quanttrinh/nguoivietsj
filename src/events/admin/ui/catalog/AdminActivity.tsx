// @boundary client
import type { JSX } from "preact";
import { useEffect, useState } from "preact/hooks";

import { adminQueries } from "~/events/admin/ui/shared/queries";
import { tableStyles } from "~/events/admin/ui/shared/table";
import { localized } from "~/events/domain/localized";
import { apiErrorMessage } from "~/shared/client/api/client";
import { useQuery } from "~/shared/client/query/use-query";
import { dateTimeFormatter } from "~/shared/utils/format";

export interface AdminActivityConfig {
  activity: string;
  time: string;
  action: string;
  actor: string;
  target: string;
  metadata: string;
  noActivity: string;
  loading: string;
  paymentConfirmAction: string;
  paymentUpdateAction: string;
  paymentUnconfirmAction: string;
  loadFailed: string;
  forbidden: string;
  eventNotFound: string;
}

function actionLabel(action: string, config: AdminActivityConfig): string {
  if (action === "payment.confirm") {
    return config.paymentConfirmAction;
  }
  if (action === "payment.update") {
    return config.paymentUpdateAction;
  }
  if (action === "payment.unconfirm") {
    return config.paymentUnconfirmAction;
  }
  return action;
}

export default function AdminActivity(props: { config: AdminActivityConfig }): JSX.Element {
  const [eventId, setEventId] = useState<string | null | undefined>();

  useEffect(() => {
    setEventId(new URLSearchParams(globalThis.location.search).get("event"));
  }, []);

  const { data, error, loading } = useQuery(
    eventId == null ? null : adminQueries.activity(eventId),
  );

  useEffect(() => {
    if (data?.event === undefined) {
      return;
    }

    const title = localized(
      data.event.title,
      document.documentElement.lang,
      data.event.slug,
      data.event.defaultLocale,
    );

    document.title = `${props.config.activity}: ${title}`;
  }, [data, props.config.activity]);

  if (eventId === undefined || loading) {
    return <p class={tableStyles.note}>{props.config.loading}</p>;
  }

  if (eventId === null) {
    return <p class={tableStyles.error}>{props.config.eventNotFound}</p>;
  }

  if (error !== null && data === null) {
    return <p class={tableStyles.error}>{apiErrorMessage(error, props.config.loadFailed)}</p>;
  }

  if (data?.event === undefined) {
    return <p class={tableStyles.error}>{props.config.eventNotFound}</p>;
  }

  const activity = data.activity;

  if (activity.length === 0) {
    return <p class={tableStyles.empty}>{props.config.noActivity}</p>;
  }

  const dateFormatter = dateTimeFormatter(document.documentElement.lang, data.event.timezone);

  return (
    <table class={tableStyles.table}>
      <thead>
        <tr>
          <th class={tableStyles.th}>{props.config.time}</th>
          <th class={tableStyles.th}>{props.config.action}</th>
          <th class={tableStyles.th}>{props.config.actor}</th>
          <th class={tableStyles.th}>{props.config.target}</th>
          <th class={tableStyles.th}>{props.config.metadata}</th>
        </tr>
      </thead>
      <tbody>
        {activity.map((item) => (
          <tr
            key={`${item.createdAt}-${item.action}-${item.actorUserId}-${item.targetId ?? "none"}`}
          >
            <td class={tableStyles.td}>{dateFormatter.format(new Date(item.createdAt))}</td>
            <td class={tableStyles.td}>{actionLabel(item.action, props.config)}</td>
            <td class={tableStyles.td}>
              <code class={tableStyles.code}>{item.actorUserId}</code>
            </td>
            <td class={tableStyles.td}>
              {item.targetId === null ? "—" : <code class={tableStyles.code}>{item.targetId}</code>}
            </td>
            <td class={tableStyles.td}>
              {item.metadata === null ? (
                "—"
              ) : (
                <code class={tableStyles.code}>{JSON.stringify(item.metadata)}</code>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
