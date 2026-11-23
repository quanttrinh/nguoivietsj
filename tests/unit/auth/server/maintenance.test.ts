import { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { session, verification } from "../../../../src/db/app/schemas/auth-schema";
import { emailDeliveries } from "../../../../src/db/app/schemas/email-deliveries";

interface DeleteStatement {
  table: unknown;
  condition?: SQL;
}

const mocks = vi.hoisted(() => ({
  drizzle: vi.fn<() => unknown>(),
  delete: vi.fn<(table: unknown) => { where: (condition: SQL) => DeleteStatement }>(),
  batch: vi.fn<(statements: DeleteStatement[]) => Promise<unknown>>(),
}));

vi.mock("drizzle-orm/d1", () => ({ drizzle: mocks.drizzle }));

const { runAppMaintenance } = await import("../../../../src/auth/server/maintenance");

const db = { name: "app-db" };

function batchedStatements(): DeleteStatement[] {
  const statements = mocks.batch.mock.lastCall?.[0];
  if (statements === undefined) {
    throw new TypeError("orm.batch was not called");
  }
  return statements;
}

function conditionTimestamp(condition: SQL | undefined) {
  if (!(condition instanceof SQL)) {
    throw new TypeError("delete statement has no SQL where condition");
  }

  const { params } = condition.toQuery({
    escapeName: (name) => name,
    escapeParam: (index: number) => `:${index}`,
    escapeString: (value) => value,
  });
  const param = params[0];
  if (typeof param !== "number") {
    throw new TypeError("condition has no numeric timestamp parameter");
  }
  return param;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.delete.mockImplementation((table: unknown) => {
    const statement: DeleteStatement = { table };
    return {
      where(condition: SQL) {
        statement.condition = condition;
        return statement;
      },
    };
  });
  mocks.batch.mockResolvedValue([]);
  mocks.drizzle.mockReturnValue({ delete: mocks.delete, batch: mocks.batch });
});

describe("runAppMaintenance", () => {
  test("prunes expired auth rows and stale email deliveries in one batch", async () => {
    const now = new Date("2026-11-17T00:00:00.000Z");

    await runAppMaintenance(db, now);

    expect(mocks.drizzle).toHaveBeenCalledExactlyOnceWith(db);
    expect(mocks.batch).toHaveBeenCalledOnce();
    const statements = batchedStatements();
    expect(statements).toHaveLength(3);
    expect(statements.map((statement) => statement.table)).toEqual([
      session,
      verification,
      emailDeliveries,
    ]);
    expect(conditionTimestamp(statements[0]?.condition)).toBe(now.getTime());
    expect(conditionTimestamp(statements[1]?.condition)).toBe(now.getTime());
    expect(conditionTimestamp(statements[2]?.condition)).toBe(
      now.getTime() - 90 * 24 * 60 * 60 * 1000,
    );
  });

  test("defaults the cutoff to the current time when no timestamp is supplied", async () => {
    const before = Date.now();
    await runAppMaintenance(db);
    const after = Date.now();

    const nowValue = conditionTimestamp(batchedStatements()[0]?.condition);
    expect(nowValue).toBeGreaterThanOrEqual(before);
    expect(nowValue).toBeLessThanOrEqual(after);
  });
});
