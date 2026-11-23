// @boundary client
import { atom } from "nanostores";

import type { LocalizedText } from "~/events/domain/types";

/** The minimum event data needed to render a page title. */
export interface EventTitleRecord {
  id: string;
  title: LocalizedText;
  slug: string;
  defaultLocale: string;
}

/** Event titles remembered across admin islands and ClientRouter navigations. */
export const eventTitles = atom<Record<string, EventTitleRecord>>({});

function titleRecord(event: EventTitleRecord): EventTitleRecord {
  return {
    id: event.id,
    title: event.title,
    slug: event.slug,
    defaultLocale: event.defaultLocale,
  };
}

/** Cache one event title for instant reuse on event subpages. */
export function rememberEventTitle(event: EventTitleRecord): void {
  const current = eventTitles.get();
  eventTitles.set({ ...current, [event.id]: titleRecord(event) });
}

/** Cache a list of event titles, usually from the catalog query. */
export function rememberEventTitles(events: readonly EventTitleRecord[]): void {
  if (events.length === 0) {
    return;
  }

  const next = { ...eventTitles.get() };

  for (const event of events) {
    next[event.id] = titleRecord(event);
  }

  eventTitles.set(next);
}
