import { useEffect, useState } from "preact/hooks";

import { fetchJsonCached, readCachedJson } from "./data-cache";

export interface CachedJsonState<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
}

/**
 * Load JSON through the shared client cache.
 *
 * A cached payload is applied as soon as the effect runs, then refreshed in
 * the background. Initial state stays identical on the server and client to
 * avoid hydration mismatches.
 */
export function useCachedJson<T>(url: string | null): CachedJsonState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(url !== null);

  useEffect(() => {
    let active = true;

    if (url === null) {
      setData(null);
      setError(null);
      setLoading(false);
    } else {
      const cached = readCachedJson<T>(url);

      if (cached === null) {
        setLoading(true);
      } else {
        setData(cached);
        setLoading(false);
      }

      void fetchJsonCached<T>(url)
        .then((payload) => {
          if (active) {
            setData(payload);
            setError(null);
          }
        })
        .catch((error_: unknown) => {
          if (active) {
            setError(error_);
          }
        })
        .finally((): void => {
          if (active) {
            setLoading(false);
          }
        });
    }

    return (): void => {
      active = false;
    };
  }, [url]);

  // Treat a non-null URL without data or error as loading until the effect runs.
  return { data, error, loading: loading || (url !== null && data === null && error === null) };
}
