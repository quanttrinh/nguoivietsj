// @boundary client
import { useStore } from "@nanostores/preact";
import { type FetcherStore } from "@nanostores/query";
import { atom } from "nanostores";

export interface QueryState<TData> {
  data: TData | null;
  error: unknown;
  loading: boolean;
  /** Revalidate the current key while keeping cached data visible. */
  refresh: () => void;
}

interface QueryStoreValue<TData> {
  data?: TData | undefined;
  error?: unknown;
  loading: boolean;
}

const idle = atom<QueryStoreValue<never>>({
  data: undefined,
  error: undefined,
  loading: false,
});

/**
 * Subscribe to a fetcher store.
 *
 * A `null` store represents a disabled query (for example, before the event id
 * has been read from the URL) and resolves immediately with no data.
 */
export function useQuery<TData>(store: FetcherStore<TData> | null): QueryState<TData> {
  const state = useStore(store ?? idle) as QueryStoreValue<TData>;
  const waiting =
    store !== null && !state.loading && state.data === undefined && state.error === undefined;

  return {
    data: state.data ?? null,
    error: state.error ?? null,
    loading: store !== null && (state.loading || waiting),
    refresh: (): void => {
      store?.revalidate();
    },
  };
}
