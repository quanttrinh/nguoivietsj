// @boundary client
import type { DeclaredLocales } from "intlayer";
import type { JSX } from "preact";
import { useEffect, useState } from "preact/hooks";

import { adminQueries } from "~/events/admin/ui/shared/queries";
import { tableStyles } from "~/events/admin/ui/shared/styles/table";
import type { AdminContentValues } from "~/events/content/admin.content";
import { localized } from "~/events/domain/localized";
import { apiErrorMessage } from "~/shared/client/api/client";
import { useQuery } from "~/shared/client/query/use-query";
import { dateTimeFormatter } from "~/shared/utils/format";

type AdminActivityLabels = Pick<
  AdminContentValues,
  | "action"
  | "activity"
  | "actor"
  | "eventNotFound"
  | "loadFailed"
  | "loading"
  | "metadata"
  | "noActivity"
  | "paymentConfirmAction"
  | "paymentUnconfirmAction"
  | "paymentUpdateAction"
  | "target"
  | "time"
>;

interface AdminActivityProps {
  labels: AdminActivityLabels;
  locale: DeclaredLocales;
}

function actionLabel(
  action: string,
  labels: Pick<
    AdminContentValues,
    "paymentConfirmAction" | "paymentUnconfirmAction" | "paymentUpdateAction"
  >,
) {
  if (action === "payment.confirm") {
    return labels.paymentConfirmAction;
  }
  if (action === "payment.update") {
    return labels.paymentUpdateAction;
  }
  if (action === "payment.unconfirm") {
    return labels.paymentUnconfirmAction;
  }
  return action;
}

export default function AdminActivity({ locale, labels }: AdminActivityProps): JSX.Element {
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

    const title = localized(data.event.title, locale, data.event.slug, data.event.defaultLocale);

    document.title = `${labels.activity}: ${title}`;
  }, [data, locale, labels.activity]);

  if (eventId === undefined || loading) {
    return <p class={tableStyles.note}>{labels.loading}</p>;
  }

  if (eventId === null) {
    return <p class={tableStyles.error}>{labels.eventNotFound}</p>;
  }

  if (error !== null && data === null) {
    return <p class={tableStyles.error}>{apiErrorMessage(error, labels.loadFailed)}</p>;
  }

  if (data?.event === undefined) {
    return <p class={tableStyles.error}>{labels.eventNotFound}</p>;
  }

  const activity = data.activity;

  if (activity.length === 0) {
    return <p class={tableStyles.empty}>{labels.noActivity}</p>;
  }

  const dateFormatter = dateTimeFormatter(locale, data.event.timezone);

  return (
    <>
      <table class={tableStyles.responsiveTable}>
        <thead>
          <tr>
            <th class={tableStyles.th}>{labels.time}</th>
            <th class={tableStyles.th}>{labels.action}</th>
            <th class={tableStyles.th}>{labels.actor}</th>
            <th class={tableStyles.th}>{labels.target}</th>
            <th class={tableStyles.th}>{labels.metadata}</th>
          </tr>
        </thead>
        <tbody>
          {activity.map((item) => (
            <tr
              key={`${item.createdAt}-${item.action}-${item.actorUserId}-${item.targetId ?? "none"}`}
            >
              <td class={tableStyles.td}>{dateFormatter.format(new Date(item.createdAt))}</td>
              <td class={tableStyles.td}>{actionLabel(item.action, labels)}</td>
              <td class={tableStyles.td}>
                <code class={tableStyles.code}>{item.actorUserId}</code>
              </td>
              <td class={tableStyles.td}>
                {item.targetId === null ? (
                  "—"
                ) : (
                  <code class={tableStyles.code}>{item.targetId}</code>
                )}
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

      <div class={tableStyles.mobileCards}>
        {activity.map((item) => (
          <div
            class={tableStyles.mobileCard}
            key={`${item.createdAt}-${item.action}-${item.actorUserId}-${item.targetId ?? "none"}`}
          >
            <div class={tableStyles.mobileCardHeading}>
              <strong class={tableStyles.mobileCardValue}>
                {actionLabel(item.action, labels)}
              </strong>
              <span class={tableStyles.note}>{dateFormatter.format(new Date(item.createdAt))}</span>
            </div>
            <div class={tableStyles.mobileCardGrid}>
              <div>
                <span class={tableStyles.mobileCardLabel}>{labels.actor}</span>
                <code class={tableStyles.code}>{item.actorUserId}</code>
              </div>
              <div>
                <span class={tableStyles.mobileCardLabel}>{labels.target}</span>
                {item.targetId === null ? (
                  <span class={tableStyles.mobileCardValue}>—</span>
                ) : (
                  <code class={tableStyles.code}>{item.targetId}</code>
                )}
              </div>
              <div>
                <span class={tableStyles.mobileCardLabel}>{labels.metadata}</span>
                {item.metadata === null ? (
                  <span class={tableStyles.mobileCardValue}>—</span>
                ) : (
                  <code class={tableStyles.code}>{JSON.stringify(item.metadata)}</code>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
