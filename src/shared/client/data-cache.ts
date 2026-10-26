interface CacheEntry {
  data: unknown;
  updatedAt: number;
}

const MAX_ENTRIES = 50;
const TTL_MS = 5 * 60 * 1000;
const entries = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

/** Read a previously fetched JSON payload synchronously. */
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- the generic describes the expected payload shape.
export function readCachedJson<T>(url: string): T | null {
  const entry = entries.get(url);

  if (entry === undefined) {
    return null;
  }

  if (Date.now() - entry.updatedAt > TTL_MS) {
    entries.delete(url);
    return null;
  }

  // Refresh insertion order so the oldest payload is evicted first.
  entries.delete(url);
  entries.set(url, entry);
  return entry.data as T;
}

function writeCachedJson<T>(url: string, data: T): T {
  entries.delete(url);
  entries.set(url, { data, updatedAt: Date.now() });

  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value;

    if (oldest === undefined) {
      break;
    }

    entries.delete(oldest);
  }

  return data;
}

/** Fetch JSON and keep the result for instant rendering on the next page. */
export function fetchJsonCached<T>(url: string): Promise<T> {
  const existing = inflight.get(url);

  if (existing !== undefined) {
    return existing as Promise<T>;
  }

  const request = fetch(url, { headers: { accept: "application/json" } })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(String(response.status));
      }

      return writeCachedJson(url, (await response.json()) as T);
    })
    .finally(() => {
      inflight.delete(url);
    });

  inflight.set(url, request);
  return request;
}
