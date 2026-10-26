import type { JSX } from "preact";
import { useEffect, useState } from "preact/hooks";

import { tableStyles } from "~/events/admin/islands/shared/table";
import { localized } from "~/events/domain/localized";
import { apiErrorMessage } from "~/shared/client/api";
import { useCachedJson } from "~/shared/client/use-cached-json";
import { dateTimeFormatter } from "~/shared/utils/format";

import { adminEventUrl } from "../islands/shared/routes";

export interface AdminCheckinRecentConfig {
  locale: string;
  eyebrow: string;
  fullName: string;
  checkedInAt: string;
  noRecent: string;
  loadFailed: string;
  forbidden: string;
  eventNotFound: string;
}

interface CheckinItem {
  id: string;
  checkedInAt: string;
  fullName: string;
}

interface CheckinListResponse {
  event: {
    id: string;
    title: Record<string, string>;
    timezone: string;
    registrationCount: number;
  };
  checkins: CheckinItem[];
  total: number;
}

export default function AdminCheckinRecent(props: {
  config: AdminCheckinRecentConfig;
}): JSX.Element {
  const [eventId, setEventId] = useState<string | null | undefined>();

  useEffect(() => {
    setEventId(new URLSearchParams(globalThis.location.search).get("event"));
  }, []);

  const api =
    eventId === undefined || eventId === null
      ? null
      : `/api/events/admin/events/${encodeURIComponent(eventId)}/checkins`;
  const { data, error, loading } = useCachedJson<CheckinListResponse>(api);

  useEffect(() => {
    if (eventId === undefined || eventId === null) {
      return;
    }

    const back = document.querySelector<HTMLAnchorElement>("#engine-checkin-back");

    if (back !== null) {
      back.href = adminEventUrl(props.config.locale, { eventId });
    }
  }, [eventId, props.config.locale]);

  useEffect(() => {
    if (data === null) {
      return;
    }

    const title = localized(data.event.title, props.config.locale, "");
    const heading = document.querySelector<HTMLElement>("#engine-checkin-title");
    const total = document.querySelector<HTMLElement>("#engine-checkin-total");
    const registrations = document.querySelector<HTMLElement>("#engine-checkin-registrations");

    if (heading !== null) {
      heading.textContent = title;
    }
    if (total !== null) {
      total.textContent = String(data.total);
    }
    if (registrations !== null) {
      registrations.textContent = String(data.event.registrationCount);
    }

    document.title = `${props.config.eyebrow}: ${title}`;
  }, [data, props.config]);

  if (eventId === null) {
    return <p class={tableStyles.error}>{props.config.eventNotFound}</p>;
  }

  if (eventId === undefined || loading) {
    return <p class={tableStyles.note}>…</p>;
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

  if (data === null || data.checkins.length === 0) {
    return <p class={tableStyles.empty}>{props.config.noRecent}</p>;
  }

  const dateTime = dateTimeFormatter(props.config.locale, data.event.timezone);

  return (
    <table class={tableStyles.table}>
      <thead>
        <tr>
          <th class={tableStyles.th}>{props.config.fullName}</th>
          <th class={tableStyles.th}>{props.config.checkedInAt}</th>
        </tr>
      </thead>
      <tbody>
        {data.checkins.map((checkin) => (
          <tr key={checkin.id}>
            <td class={tableStyles.td}>{checkin.fullName}</td>
            <td class={tableStyles.td}>{dateTime.format(new Date(checkin.checkedInAt))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
