// @boundary client
import { useStore } from "@nanostores/preact";
import type { JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

import { localized } from "~/events/domain/localized";

import { eventTitles } from "./event-titles";

interface Props {
  locale: string;
  fallback?: string;
  class?: string;
  id?: string | undefined;
}

function readEventId(url: URL): string | null {
  return url.searchParams.get("event");
}

function currentEventId(): string | null {
  const location: Location | undefined = globalThis.location;

  // oxlint-disable-next-line typescript/no-unnecessary-condition -- location is absent during SSR.
  return location === undefined ? null : readEventId(new URL(location.href));
}

/**
 * Shared event-title island.
 *
 * The title is cached by event id and reused on event subpages. If navigation
 * moves to another event, the previous title is blanked before the swap so a
 * stale title cannot be shown while the new event loads.
 */
export default function EventTitle(props: Props): JSX.Element {
  const [eventId, setEventId] = useState<string | null>(() => currentEventId());
  const [pending, setPending] = useState(false);
  const eventIdRef = useRef(eventId);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const titles = useStore(eventTitles);

  useEffect(() => {
    eventIdRef.current = eventId;
  }, [eventId]);

  useEffect(() => {
    function onBeforeSwap(event: Event): void {
      const swap = event as Event & { to?: URL };
      const next = swap.to === undefined ? null : readEventId(swap.to);

      if (next !== eventIdRef.current) {
        setPending(true);

        // Clear synchronously so the old event title cannot remain visible
        // during the swap before the state update renders.
        if (headingRef.current !== null) {
          headingRef.current.textContent = "";
        }
      }
    }

    function onPageLoad(): void {
      const next = currentEventId();
      eventIdRef.current = next;
      setEventId(next);
      setPending(false);
    }

    document.addEventListener("astro:before-swap", onBeforeSwap);
    document.addEventListener("astro:page-load", onPageLoad);

    return () => {
      document.removeEventListener("astro:before-swap", onBeforeSwap);
      document.removeEventListener("astro:page-load", onPageLoad);
    };
  }, []);

  const record = eventId === null ? undefined : titles[eventId];
  const title =
    pending || record === undefined
      ? ""
      : localized(record.title, props.locale, record.slug, record.defaultLocale);

  return (
    <h1 ref={headingRef} id={props.id} class={props.class}>
      {title.length > 0 ? title : (props.fallback ?? "")}
    </h1>
  );
}
