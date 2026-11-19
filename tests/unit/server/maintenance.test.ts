import { describe, expect, test } from "vitest";

import { runMaintenance, type MaintenanceTask } from "../../../src/server/maintenance";

describe("runMaintenance", () => {
  test("runs every task with the same timestamp and isolates failures", async () => {
    const now = new Date("2026-11-17T00:00:00.000Z");
    const seen: Date[] = [];
    const tasks: MaintenanceTask[] = [
      {
        name: "first",
        run: (value) => {
          seen.push(value);
          return Promise.resolve();
        },
      },
      {
        name: "failing",
        run: () => Promise.reject(new Error("boom")),
      },
      {
        name: "last",
        run: (value) => {
          seen.push(value);
          return Promise.resolve();
        },
      },
    ];

    const results = await runMaintenance(tasks, now);

    expect(seen).toEqual([now, now]);
    expect(results).toEqual([
      expect.objectContaining({ name: "first", ok: true }),
      expect.objectContaining({ name: "failing", ok: false }),
      expect.objectContaining({ name: "last", ok: true }),
    ]);
    expect(results.every((result) => result.durationMs >= 0)).toBe(true);
  });
});
