// @boundary client
import { navigate } from "astro:transitions/client";
import type { JSX } from "preact";
import { useEffect, useState } from "preact/hooks";

import { can } from "~/auth/permissions";
import { adminQueries, adminRefresh } from "~/events/admin/ui/shared/queries";
import { adminCatalogUrl } from "~/events/admin/ui/shared/routes";
import { localized } from "~/events/domain/localized";
import { apiClient, apiErrorMessage, readApiJson } from "~/shared/client/api/client";
import { useQuery } from "~/shared/client/query/use-query";

import { styles } from "./admin-detail-styles";
import type { Props } from "./admin-detail-types";
import { EventDetailHeader } from "./EventDetailHeader";
import { TicketTypesPanel } from "./TicketTypesPanel";

export default function AdminEventDetail({ locale, labels }: Props): JSX.Element | null {
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
  const canReadTickets = can(role, { eventTicket: ["read"] });
  let error: string | null = null;

  if (eventId === null) {
    error = labels.eventNotFound;
  } else if (queryError !== null) {
    error = apiErrorMessage(queryError, labels.loadFailed);
  }

  useEffect(() => {
    if (current === null) {
      return;
    }

    document.title = `${labels.event}: ${localized(current.title, locale, current.slug)}`;
  }, [current, labels.event, locale]);

  async function archiveEvent(): Promise<void> {
    // oxlint-disable-next-line eslint/no-alert -- Admin-only destructive confirmation is sufficient.
    if (current === null || !globalThis.confirm(labels.archiveEventConfirm)) {
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
      await navigate(adminCatalogUrl(locale));
    } catch (archiveError) {
      setNotice(apiErrorMessage(archiveError, labels.archiveEventFailed));
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
            locale={locale}
            labels={labels}
            current={current}
            role={role}
            notice={notice}
            onArchive={() => void archiveEvent()}
          />
          {canReadTickets ? (
            <TicketTypesPanel locale={locale} labels={labels} current={current} />
          ) : null}
        </>
      ) : null}
      {error && <p class={styles.error}>{error}</p>}
    </section>
  );
}
