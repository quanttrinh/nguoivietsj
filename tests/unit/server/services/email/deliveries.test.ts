import { drizzle } from "drizzle-orm/d1";
import { beforeEach, describe, expect, test, vi, type Mock } from "vitest";

import { getEmailDeliveryLedger } from "../../../../../src/server/services/email/deliveries";

const { ormHolder } = vi.hoisted(() => {
  const holder: { current: unknown } = { current: undefined };
  return { ormHolder: holder };
});

vi.mock("drizzle-orm/d1", () => ({ drizzle: vi.fn(() => ormHolder.current) }));

interface FakeD1Database {
  prepare: Mock;
  batch: Mock;
  exec: Mock;
  withSession: Mock;
  dump: Mock;
}

function fakeDb(): FakeD1Database {
  return {
    prepare: vi.fn(),
    batch: vi.fn(),
    exec: vi.fn(),
    withSession: vi.fn(),
    dump: vi.fn(),
  };
}

interface CapturedCalls {
  values?: unknown;
  conflict?: unknown;
  selection?: unknown;
  set?: unknown;
}

interface FakeOrm {
  insert: Mock;
  values: Mock;
  onConflictDoUpdate: Mock;
  returning: Mock;
  update: Mock;
  set: Mock;
  where: Mock;
  captured: CapturedCalls;
}

function fakeOrm(claimRows: { idempotencyKey: string }[] = []): FakeOrm {
  const captured: CapturedCalls = {};
  const returning = vi.fn((selection: unknown) => {
    captured.selection = selection;
    return Promise.resolve(claimRows);
  });
  const onConflictDoUpdate = vi.fn((conflict: unknown) => {
    captured.conflict = conflict;
    return { returning };
  });
  const values = vi.fn((value: unknown) => {
    captured.values = value;
    return { onConflictDoUpdate };
  });
  const insert = vi.fn(() => ({ values }));
  const where = vi.fn(() => Promise.resolve(undefined));
  const set = vi.fn((value: unknown) => {
    captured.set = value;
    return { where };
  });
  const update = vi.fn(() => ({ set }));

  ormHolder.current = { insert, update };

  return { insert, values, onConflictDoUpdate, returning, update, set, where, captured };
}

beforeEach(() => {
  vi.mocked(drizzle).mockClear();
});

describe("email delivery ledger", () => {
  test("claim inserts a processing row and returns true when a row is returned", async () => {
    const orm = fakeOrm([{ idempotencyKey: "key-1" }]);
    const ledger = getEmailDeliveryLedger(fakeDb());

    await expect(ledger.claim("key-1", "auth.two_factor.code")).resolves.toBe(true);

    expect(orm.insert).toHaveBeenCalledOnce();
    expect(orm.captured.values).toEqual({
      idempotencyKey: "key-1",
      jobType: "auth.two_factor.code",
      status: "processing",
      attempts: 1,
    });
    expect(orm.onConflictDoUpdate).toHaveBeenCalledOnce();
    expect(orm.captured.conflict).toMatchObject({
      set: { status: "processing", lastError: null },
    });
    expect(orm.captured.conflict).toHaveProperty("target");
    expect(orm.captured.conflict).toHaveProperty("setWhere");
    expect(orm.captured.conflict).toHaveProperty("set.attempts");
    expect(orm.returning).toHaveBeenCalledOnce();
    expect(orm.captured.selection).toHaveProperty("idempotencyKey");
  });

  test("claim returns false when the conflict guard blocks the update", async () => {
    fakeOrm([]);
    const ledger = getEmailDeliveryLedger(fakeDb());

    await expect(ledger.claim("key-1", "auth.two_factor.code")).resolves.toBe(false);
  });

  test("markSent clears the last error and records delivery", async () => {
    const orm = fakeOrm();
    const ledger = getEmailDeliveryLedger(fakeDb());

    await ledger.markSent("key-1");

    expect(orm.update).toHaveBeenCalledOnce();
    expect(orm.captured.set).toEqual({ status: "sent", lastError: null });
    expect(orm.where).toHaveBeenCalledOnce();
  });

  test.for([
    { label: "short error stays intact", error: "short error", expected: "short error" },
    { label: "long error is truncated", error: "x".repeat(600), expected: "x".repeat(500) },
  ])("markFailed stores the error ($label)", async ({ error, expected }) => {
    const orm = fakeOrm();
    const ledger = getEmailDeliveryLedger(fakeDb());

    await ledger.markFailed("key-1", error);

    expect(orm.captured.set).toEqual({ status: "failed", lastError: expected });
    expect(orm.where).toHaveBeenCalledOnce();
  });

  test("caches one ledger per database binding", () => {
    fakeOrm();
    const firstDb = fakeDb();
    const secondDb = fakeDb();

    const first = getEmailDeliveryLedger(firstDb);
    expect(getEmailDeliveryLedger(firstDb)).toBe(first);
    expect(getEmailDeliveryLedger(secondDb)).not.toBe(first);
    expect(drizzle).toHaveBeenCalledTimes(2);
  });
});
