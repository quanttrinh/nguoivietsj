import type { JSX } from "preact";
import { useEffect, useState } from "preact/hooks";

import { localized } from "~/events/domain/localized";
import { apiErrorMessage } from "~/shared/client/api";
import { useCachedJson } from "~/shared/client/use-cached-json";
import { dateTimeFormatter } from "~/shared/utils/format";

import { adminEventUrl } from "../islands/shared/routes";
import { tableStyles } from "../islands/shared/table";

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

interface AuditEvent {
  action: string;
  actorUserId: string;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface ActivityResponse {
  event?: {
    id: string;
    slug: string;
    defaultLocale: string;
    title: Record<string, string>;
    timezone: string;
  };
  activity?: AuditEvent[];
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

  const api =
    eventId === undefined || eventId === null
      ? null
      : `/api/events/admin/events/${encodeURIComponent(eventId)}/activity`;
  const { data, error, loading } = useCachedJson<ActivityResponse>(api);

  useEffect(() => {
    if (eventId === undefined || eventId === null) {
      return;
    }

    const back = document.querySelector<HTMLAnchorElement>("#engine-activity-back");

    if (back !== null) {
      back.href = adminEventUrl(document.documentElement.lang, { eventId });
    }
  }, [eventId]);

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
    const heading = document.querySelector<HTMLElement>("#engine-activity-title");

    if (heading !== null) {
      heading.textContent = title;
    }

    document.title = `${props.config.activity}: ${title}`;
  }, [data, props.config.activity]);

  if (eventId === undefined || loading) {
    return <p class={tableStyles.note}>{props.config.loading}</p>;
  }

  if (eventId === null) {
    return <p class={tableStyles.error}>{props.config.eventNotFound}</p>;
  }

  if (error !== null && data === null) {
    return (
      <p class={tableStyles.error}>
        {apiErrorMessage(error, {
          loadFailed: props.config.loadFailed,
          forbidden: props.config.forbidden,
          notFound: props.config.eventNotFound,
        })}
      </p>
    );
  }

  if (data?.event === undefined) {
    return <p class={tableStyles.error}>{props.config.eventNotFound}</p>;
  }

  const activity = data.activity ?? [];

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
