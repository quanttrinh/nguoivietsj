// @boundary client
import { nanoquery } from "@nanostores/query";

/**
 * Shared query cache for every island in the document.
 *
 * ClientRouter keeps bundled modules alive across navigations, so these stores
 * survive route changes without persistence. Data is only refetched when a
 * mutation invalidates it, a page calls `refresh`, or the document reloads.
 *
 * `dedupeTime` must stay `Infinity`: the library's default (4s) would refetch
 * whenever a route is revisited after a short delay.
 */
export const [createFetcherStore, , { invalidateKeys, revalidateKeys, mutateCache }] = nanoquery({
  dedupeTime: Infinity,
  cacheLifetime: Infinity,
  // Permanent client errors should surface immediately; transient failures
  // retry with a capped delay so a cached error never traps a page.
  onErrorRetry: ({ error, retryCount }): number | null => {
    if (error instanceof Error) {
      const status = Number(error.message);

      if (Number.isInteger(status) && status >= 400 && status < 500) {
        return null;
      }
    }

    return Math.min(30_000, 2 ** Math.min(retryCount, 5) * 1000);
  },
});
