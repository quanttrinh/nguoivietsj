/** Cache tag shared by every locale and variant of a public event page. */
export function eventCacheTag(eventId: string): string {
  return `event:${eventId}`;
}

/** Cache tag for the public event list. */
export const EVENT_LIST_CACHE_TAG = "event-list";

export const EVENT_PAGE_CACHE_MAX_AGE_SECONDS = 60;
export const EVENT_PAGE_CACHE_SWR_SECONDS = 300;

interface CacheInvalidator {
  readonly enabled: boolean;
  invalidate: (input: { tags: string[] }) => Promise<void>;
}

/** Purge every cached locale/variant of a public event page. */
export async function invalidateEventPage(cache: CacheInvalidator, eventId: string): Promise<void> {
  if (!cache.enabled) {
    return;
  }

  await cache.invalidate({ tags: [eventCacheTag(eventId)] });
}

/** Purge the public event list after catalog changes. */
export async function invalidateEventList(cache: CacheInvalidator): Promise<void> {
  if (!cache.enabled) {
    return;
  }

  await cache.invalidate({ tags: [EVENT_LIST_CACHE_TAG] });
}
