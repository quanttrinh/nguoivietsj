// @boundary client
import type { JSX } from "preact";
import { useEffect, useState } from "preact/hooks";

import { css } from "styled-system/css";
import { grid, vstack, wrap } from "styled-system/patterns";
import { localized } from "~/events/domain/localized";
import type { PublicEventSummary } from "~/events/domain/types";
import { apiClient, apiErrorMessage, readApiJson } from "~/shared/client/api/client";
import { clientLogger } from "~/shared/client/logger";
import type { Locale as DeclaredLocales } from "~/shared/i18n";
import { dateTimeFormatter } from "~/shared/utils/format";

const getEvents = apiClient.api.events.$get;

interface EventListProps {
  locale: DeclaredLocales;
  messages: {
    noEvents: string;
    unavailable: string;
    viewEvent: string;
    register: string;
    registrationClosed: string;
  };
}

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; events: PublicEventSummary[] };

const styles = {
  list: grid({ gap: "4", gridTemplateColumns: { base: "1fr", md: "1fr 1fr" } }),
  card: vstack({
    alignItems: "stretch",
    gap: "4",
    rounded: "xl",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "outlineVariant",
    bgColor: "surfaceContainerLowest",
    p: "5",
    color: "inherit",
    textDecoration: "none",
    _hover: { borderColor: "primary", bgColor: "surfaceContainerLow" },
    _focusVisible: {
      ringWidth: "thick",
      outlineStyle: "solid",
      ringColor: "primary",
      ringOffset: "1",
    },
  }),
  header: vstack({ alignItems: "stretch", gap: "2" }),
  cardTitle: css({ textStyle: "name-lg" }),
  summary: css({ textStyle: "body-md", color: "onSurfaceVariant" }),
  meta: wrap({ gap: "2", textStyle: "body-md", color: "onSurfaceVariant" }),
  badge: css({
    rounded: "full",
    bgColor: "surfaceContainerHigh",
    px: "2.5",
    py: "0.5",
    textStyle: "caption-strong",
  }),
  cta: css({
    textStyle: "link-strong",
    fontSize: "sm",
    color: "primary",
    textUnderlineOffset: "0.5",
  }),
  message: css({ textStyle: "body-md", color: "onSurfaceVariant" }),
};

function formatStart(event: PublicEventSummary, locale: string) {
  if (event.startsAt === null) {
    return null;
  }

  try {
    return dateTimeFormatter(locale, event.timezone).format(new Date(event.startsAt));
  } catch {
    return event.startsAt;
  }
}

function EventCard({
  event,
  locale,
  messages,
}: {
  event: PublicEventSummary;
  locale: DeclaredLocales;
  messages: EventListProps["messages"];
}) {
  const when = formatStart(event, locale);
  const summary = localized(event.summary, locale, "", event.defaultLocale);
  const href = `/${locale}/events/registration?${new URLSearchParams({ slug: event.slug }).toString()}`;

  return (
    <a class={styles.card} href={href}>
      <div class={styles.header}>
        <h2 class={styles.cardTitle}>
          {localized(event.title, locale, event.slug, event.defaultLocale)}
        </h2>
        {summary.length > 0 ? <p class={styles.summary}>{summary}</p> : null}
      </div>
      <div class={styles.meta}>
        {when === null ? null : <span>{when}</span>}
        <span class={styles.badge}>
          {event.registrationOpen ? messages.register : messages.registrationClosed}
        </span>
      </div>
      <span class={styles.cta}>{messages.viewEvent}</span>
    </a>
  );
}

/** Public event list, loaded from the cached `GET /api/events` endpoint. */
export default function EventList({ locale, messages }: EventListProps): JSX.Element | null {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    void (async (): Promise<void> => {
      try {
        const payload = await readApiJson(await getEvents());
        setState({ kind: "ready", events: payload.data.events });
      } catch (error: unknown) {
        clientLogger.error(error);
        setState({ kind: "error", message: apiErrorMessage(error, messages.unavailable) });
      }
    })();
  }, [messages.unavailable]);

  if (state.kind === "loading") {
    return null;
  }

  if (state.kind === "error" || state.events.length === 0) {
    return (
      <p class={styles.message} role="status">
        {state.kind === "error" ? state.message : messages.noEvents}
      </p>
    );
  }

  return (
    <div class={styles.list}>
      {state.events.map((event) => (
        <EventCard key={event.id} event={event} locale={locale} messages={messages} />
      ))}
    </div>
  );
}
