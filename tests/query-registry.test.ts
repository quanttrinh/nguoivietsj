import { describe, expect, it, vi } from "vitest";

import { queryStore } from "../src/shared/client/query/registry";

describe("query registry", () => {
  it("reuses one store per request key", () => {
    const first = queryStore("test:identity", () => Promise.resolve(1));
    const second = queryStore("test:identity", () => Promise.resolve(2));

    expect(second).toBe(first);
  });

  it("serves cached data after remount without refetching", async () => {
    const fetcher = vi.fn(() => Promise.resolve(7));
    const store = queryStore("test:cache", fetcher);

    const unsubscribe = store.listen(() => undefined);
    await vi.waitFor(() => {
      expect(store.get().data).toBe(7);
    });

    expect(fetcher).toHaveBeenCalledTimes(1);

    unsubscribe();

    const resubscribe = store.listen(() => undefined);
    await vi.waitFor(() => {
      expect(store.get().data).toBe(7);
    });

    expect(fetcher).toHaveBeenCalledTimes(1);

    resubscribe();
  });
});
