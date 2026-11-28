// @boundary client
import { useEffect, useRef, useState } from "preact/hooks";

export interface ApiQueryState<TData> {
  data: TData | null;
  error: unknown;
  loading: boolean;
}

/**
 * Run one typed API request when its identity changes.
 *
 * Request de-duplication and freshness are left to standard HTTP caching on
 * the server/CDN; this hook only manages component lifecycle and stale updates.
 */
export function useApiQuery<TData>(
  requestKey: string | null,
  load: (() => Promise<TData>) | null,
): ApiQueryState<TData> {
  const [data, setData] = useState<TData | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(requestKey !== null);
  const loadRef = useRef(load);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError(null);

    const loader = loadRef.current;

    if (requestKey === null || loader === null) {
      setLoading(false);
    } else {
      setLoading(true);

      void (async (): Promise<void> => {
        try {
          const payload = await loader();

          if (!controller.signal.aborted) {
            setData(payload);
            setError(null);
          }
        } catch (error_: unknown) {
          if (!controller.signal.aborted) {
            setError(error_);
          }
        } finally {
          if (!controller.signal.aborted) {
            setLoading(false);
          }
        }
      })();
    }

    return (): void => {
      controller.abort();
    };
  }, [requestKey]);

  return {
    data,
    error,
    loading: loading || (requestKey != null && data == null && error == null),
  };
}
