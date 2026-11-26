import { describe, expect, test } from "vitest";

import { runMaintenance, type MaintenanceTask } from "../../../src/maintenance";

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

  test("defaults the timestamp to now when none is supplied", async () => {
    let received: Date | undefined;

    const [result] = await runMaintenance([
      {
        name: "default-time",
        run: (value) => {
          received = value;
          return Promise.resolve();
        },
      },
    ]);

    expect(result).toMatchObject({ name: "default-time", ok: true });
    expect(received).toBeInstanceOf(Date);
  });

  test.for([
    { label: "string", thrown: "text failure" },
    { label: "number", thrown: 42 },
    { label: "object", thrown: { reason: "nope" } },
  ])("isolates a non-Error rejection ($label)", async ({ thrown }) => {
    const results = await runMaintenance([
      {
        name: "non-error",
        // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- verify non-Error failures are isolated and logged.
        run: () => Promise.reject(thrown),
      },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ name: "non-error", ok: false });
    expect(results[0]?.error).toBe(thrown);
  });
});
