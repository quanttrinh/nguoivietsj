import type { JSX } from "preact";
/* oxlint-disable eslint/no-nested-ternary, unicorn/no-nested-ternary, eslint/no-negated-condition, unicorn/no-negated-condition -- Direct rendering keeps related state branches together. */
import { useEffect, useState } from "preact/hooks";

import { localized } from "~/events/domain/localized";
import { apiErrorMessage } from "~/shared/client/api";
import { fetchJsonCached, readCachedJson } from "~/shared/client/data-cache";
import { USER_ROLE, type UserRole } from "~/shared/constants/roles";

import { styles } from "./admin-detail-styles";
import type {
  Checkin,
  EventDetail,
  FormVersion,
  OverviewResponse,
  Props,
  Registration,
} from "./admin-detail-types";
import { EventDetailHeader } from "./EventDetailHeader";
import { FormVersionsPanel } from "./FormVersionsPanel";
import { RegistrationsPanel } from "./RegistrationsPanel";
import { TicketTypesPanel } from "./TicketTypesPanel";

export default function AdminEventDetail(props: Props): JSX.Element {
  const [role, setRole] = useState<UserRole | null>(null);
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [formVersions, setFormVersions] = useState<FormVersion[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [checkins, setCheckins] = useState<Map<string, Checkin>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const isAdmin = role === USER_ROLE.admin;
  useEffect(() => {
    document.querySelector("#engine-admin-detail-placeholder")?.remove();
    void (async (): Promise<void> => {
      await import("~/shared/client/qui-button");
      const eventId = new URLSearchParams(globalThis.location.search).get("event");
      if (eventId === null || eventId.length === 0) {
        setError(props.messages.eventNotFound);
        return;
      }
      const overviewUrl = `/api/events/admin/events/${encodeURIComponent(eventId)}/overview`;
      const apply = (payload: OverviewResponse): void => {
        setRole(payload.role);
        setEvent(payload.event);
        setRegistrations(payload.registrations);
        setCheckins(new Map(payload.checkins.map((item) => [item.registrationId, item])));
        setFormVersions(payload.formVersions);
        document.title = `${props.messages.event}: ${localized(payload.event.title, props.locale, payload.event.slug)}`;
      };
      const cached = readCachedJson<OverviewResponse>(overviewUrl);
      if (cached !== null) {
        apply(cached);
      }
      try {
        apply(await fetchJsonCached<OverviewResponse>(overviewUrl));
      } catch (error_) {
        setError(
          apiErrorMessage(error_, {
            loadFailed: props.messages.loadFailed,
            forbidden: props.messages.forbidden,
            notFound: props.messages.eventNotFound,
          }),
        );
      }
    })();
  }, [props]);
  async function archiveEvent(): Promise<void> {
    const current = event;

    // oxlint-disable-next-line eslint/no-alert -- Admin-only destructive confirmation is sufficient.
    if (current === null || !globalThis.confirm(props.messages.archiveEventConfirm)) {
      return;
    }
    setNotice(null);
    try {
      const response = await fetch(`/api/events/admin/events/${encodeURIComponent(current.id)}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          status: "archived",
          enabled: false,
          registrationOpen: false,
        }),
      });
      if (!response.ok) {
        throw new Error(String(response.status));
      }
      globalThis.location.assign(`/${props.locale}/events/admin`);
    } catch {
      setNotice(props.messages.archiveEventFailed);
    }
  }
  const current = event;

  return (
    <section class={styles.section}>
      <h1 class={styles.title} data-title-preserve hidden={current !== null || error !== null}>
        {current === null ? "" : localized(current.title, props.locale, current.slug)}
      </h1>
      {error === null ? (
        current === null ? null : (
          <>
            <EventDetailHeader
              locale={props.locale}
              messages={props.messages}
              current={current}
              isAdmin={isAdmin}
              notice={notice}
              onArchive={() => void archiveEvent()}
            />
            {isAdmin ? (
              <div class={styles.grid}>
                <TicketTypesPanel
                  locale={props.locale}
                  messages={props.messages}
                  current={current}
                />
                <FormVersionsPanel
                  locale={props.locale}
                  messages={props.messages}
                  current={current}
                  versions={formVersions}
                />
              </div>
            ) : null}
            <RegistrationsPanel
              locale={props.locale}
              messages={props.messages}
              current={current}
              registrations={registrations}
              checkins={checkins}
            />
          </>
        )
      ) : (
        <p class={styles.error}>{error}</p>
      )}
    </section>
  );
}
