// @boundary server
/* oxlint-disable eslint/no-bitwise -- UUIDv7 construction requires bit operations. */
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/sqlite-proxy";

import { ROLES, type Role } from "#tooling/d1/config";
import { createD1Context } from "#tooling/d1/d1";
import { toSqlStatement } from "#tooling/d1/sql";
import { defineBackfill } from "#tooling/manage/backfill";

import { user } from "../../db/app/schemas/auth-schema";

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/u;

function uuid7(): string {
  const timestamp = BigInt(Date.now()) & ((1n << 48n) - 1n);
  const bytes = randomBytes(10);
  const randomA = BigInt(bytes.readUInt16BE(0) & 4095);
  const randomB = bytes.readBigUInt64BE(2) & ((1n << 62n) - 1n);
  const value = (timestamp << 80n) | (0x7n << 76n) | (randomA << 64n) | (0b10n << 62n) | randomB;
  const hex = value.toString(16).padStart(32, "0");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20,
  )}-${hex.slice(20)}`;
}

function roleOption(value: string): Role {
  const role = ROLES.find((candidate) => candidate === value);

  if (role === undefined) {
    throw new Error(`Invalid role: ${value}`);
  }

  return role;
}

export default defineBackfill({
  description: "Create or update a staff/admin account.",
  usage: "bun manage.ts create-user --target local -- <email> [--role event_staff|admin]",
  run: async (context, args) => {
    const { values, positionals } = parseArgs({
      args,
      allowPositionals: true,
      options: {
        role: { type: "string", default: "event_staff" },
      },
      strict: true,
    });
    const email = positionals[0]?.trim().toLowerCase() ?? "";

    if (!EMAIL_PATTERN.test(email)) {
      throw new Error("Enter a valid email address.");
    }

    const role = roleOption(values.role);
    const query = drizzle({
      get: () => Promise.resolve(undefined),
      all: () => Promise.resolve([]),
      run: () => Promise.resolve(undefined),
    })
      .insert(user)
      .values({
        id: uuid7(),
        name: email,
        email,
        createdAt: new Date(),
        updatedAt: new Date(),
        role,
      })
      .onConflictDoUpdate({
        target: user.email,
        set: { role: sql`excluded.role` },
      })
      .getSQL();
    const db = createD1Context(context.target, context.dryRun, context.log);

    db.log(`Creating ${role} ${email} on ${db.target}.`);
    await db.database.execute("app", toSqlStatement(query));
    db.log(`${role} ${email} created.`);
  },
});
