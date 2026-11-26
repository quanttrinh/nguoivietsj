// @boundary server
import { parseArgs } from "node:util";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/sqlite-proxy";

import { createD1Context } from "#tooling/d1/d1";
import { toSqlStatement } from "#tooling/d1/sql";
import { defineBackfill } from "#tooling/manage/backfill";
import { USER_ROLE, type UserRole } from "~/features/auth/roles";
import { EMAIL_REGEX } from "~/features/events/domain/patterns";
import { user } from "~/platform/server/db/app/schemas/auth-schema";
import { newId } from "~/platform/utils/uuid";

const ASSIGNABLE_ROLES = [USER_ROLE.event_staff, USER_ROLE.admin] as const;

function roleOption(value: string): UserRole {
  const role = ASSIGNABLE_ROLES.find((candidate) => candidate === value);

  if (role === undefined) {
    throw new Error(`Invalid role: ${value}`);
  }

  return role;
}

const db = drizzle({
  get: () => Promise.resolve(undefined),
  all: () => Promise.resolve([]),
  run: () => Promise.resolve(undefined),
});

export default defineBackfill({
  description: "Create or update a staff/admin account for passwordless email OTP sign-in.",
  usage: "node manage.ts create-user --target local -- <email> [--role event_staff|admin]",
  run: async (context, args) => {
    const { values, positionals } = parseArgs({
      args,
      allowPositionals: true,
      options: { role: { type: "string", default: "event_staff" } },
      strict: true,
    });
    const email = positionals[0]?.trim().toLowerCase() ?? "";

    if (!EMAIL_REGEX.test(email)) {
      throw new Error("Enter a valid email address.");
    }

    const role = roleOption(values.role);
    const now = new Date();
    const query = db
      .insert(user)
      .values({
        id: newId(),
        name: email,
        email,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
        role,
      })
      .onConflictDoUpdate({
        target: user.email,
        set: { role: sql`excluded.role`, emailVerified: true, updatedAt: sql`excluded.updated_at` },
      })
      .getSQL();
    const d1 = await createD1Context(context.target, context.dryRun, context.log);

    d1.log(`Creating ${role} ${email} on ${d1.target}.`);
    await d1.database.execute("APP_DB", toSqlStatement(query));
    d1.log(`${role} ${email} created — sign in with an emailed code.`);
  },
});
