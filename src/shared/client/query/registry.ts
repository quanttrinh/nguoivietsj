// @boundary client
import type { CommonSettings, FetcherStore } from "@nanostores/query";

import { createFetcherStore, invalidateKeys } from "./client";

/**
 * Cap the registry so long admin sessions with many events do not grow the
 * in-memory cache without bound. Only inactive stores are evicted; an evicted
 * active query would immediately refetch and make a visible page flash.
 */
const MAX_QUERY_STORES = 100;

const stores = new Map<string, FetcherStore<unknown>>();

function evictInactiveStore(): void {
  for (const [key, store] of stores) {
    if (store.lc === 0) {
      invalidateKeys(key);
      stores.delete(key);
      return;
    }
  }
}

/**
 * Return the singleton fetcher store for a request key.
 *
 * The key must contain every request input (ids, locale, filters, page) so a
 * different input never reuses another request's cache entry.
 */
export function queryStore<TData>(
  key: string,
  fetcher: () => Promise<TData>,
  settings: CommonSettings<TData> = {},
): FetcherStore<TData> {
  const cached = stores.get(key);

  if (cached !== undefined) {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Stores are keyed by their request signature.
    return cached as FetcherStore<TData>;
  }

  if (stores.size >= MAX_QUERY_STORES) {
    evictInactiveStore();
  }

  const store = createFetcherStore<TData>(key, { ...settings, fetcher });
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- stores are keyed by their request signature.
  stores.set(key, store as FetcherStore<unknown>);

  return store;
}
