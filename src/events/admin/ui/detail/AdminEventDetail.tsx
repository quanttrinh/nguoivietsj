// @boundary client
import { navigate } from "astro:transitions/client";
import { type JSX } from "preact";
import { useEffect, useState } from "preact/hooks";

import { can } from "~/auth/permissions";
import { adminQueries, adminRefresh } from "~/events/admin/ui/shared/queries";
import { adminCatalogUrl } from "~/events/admin/ui/shared/routes";
import { localized } from "~/events/domain/localized";
import { apiClient, apiErrorMessage, readApiJson } from "~/shared/client/api/client";
import { useQuery } from "~/shared/client/query/use-query";

import { styles } from "./admin-detail-styles";
import { type Props } from "./admin-detail-types";
import { EventDetailHeader } from "./EventDetailHeader";
import { FormVersionsPanel } from "./FormVersionsPanel";
import { RegistrationsPanel } from "./RegistrationsPanel";
import { TicketTypesPanel } from "./TicketTypesPanel";

export default function AdminEventDetail(props: Props): JSX.Element | null {
  const [eventId, setEventId] = useState<string | null | undefined>();
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    document.querySelector("#engine-admin-detail-placeholder")?.remove();
    setEventId(new URLSearchParams(globalThis.location.search).get("event"));
  }, []);

  const {
    data,
    error: queryError,
    loading,
  } = useQuery(eventId == null ? null : adminQueries.overview(eventId));
  const role = data?.role ?? null;
  const current = data?.event ?? null;
  const formVersions = data?.formVersions ?? [];
  const registrations = data?.registrations ?? [];
  const checkins = new Map(
    (data?.checkins ?? []).map((item) => [item.registrationId, item] as const),
  );
  const canReadTickets = can(role, { eventTicket: ["read"] });
  const canReadForms = can(role, { eventForm: ["read"] });
  let error: string | null = null;

  if (eventId === null) {
    error = props.messages.eventNotFound;
  } else if (queryError !== null) {
    error = apiErrorMessage(queryError, props.messages.loadFailed);
  }

  useEffect(() => {
    if (current === null) {
      return;
    }

    document.title = `${props.messages.event}: ${localized(current.title, props.locale, current.slug)}`;
  }, [current, props.messages.event, props.locale]);

  async function archiveEvent(): Promise<void> {
    // oxlint-disable-next-line eslint/no-alert -- Admin-only destructive confirmation is sufficient.
    if (current === null || !globalThis.confirm(props.messages.archiveEventConfirm)) {
      return;
    }
    setNotice(null);
    try {
      await readApiJson(
        await apiClient.api.admin.events[":eventId"].$patch({
          param: { eventId: current.id },
          json: {
            status: "archived",
            enabled: false,
            registrationOpen: false,
          },
        }),
      );
      adminRefresh.afterArchive(current.id);
      await navigate(adminCatalogUrl(props.locale));
    } catch (archiveError) {
      setNotice(apiErrorMessage(archiveError, props.messages.archiveEventFailed));
    }
  }
  if (eventId === undefined || loading) {
    return null;
  }

  return (
    <section class={styles.section}>
      {error === null && current !== null ? (
        <>
          <EventDetailHeader
            locale={props.locale}
            messages={props.messages}
            current={current}
            role={role}
            notice={notice}
            onArchive={() => void archiveEvent()}
          />
          {canReadTickets || canReadForms ? (
            <div class={styles.grid}>
              {canReadTickets ? (
                <TicketTypesPanel
                  locale={props.locale}
                  messages={props.messages}
                  current={current}
                />
              ) : null}
              {canReadForms ? (
                <FormVersionsPanel
                  locale={props.locale}
                  messages={props.messages}
                  current={current}
                  versions={formVersions}
                />
              ) : null}
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
      ) : null}
      {error && <p class={styles.error}>{error}</p>}
    </section>
  );
}
