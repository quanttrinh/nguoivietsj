// @boundary server
import { parseArgs } from "node:util";

import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/sqlite-proxy";

import { createD1Context } from "#tooling/d1/d1";
import { toSqlStatement } from "#tooling/d1/sql";
import { defineBackfill } from "#tooling/manage/backfill";

import { USER_ROLE, type UserRole } from "../../auth/roles";
import { account, user } from "../../db/app/schemas/auth-schema";
import { EMAIL_REGEX } from "../../events/domain/patterns";
import { newId } from "../../shared/utils/uuid";
import { cliPasswordHashers } from "../password";

const ASSIGNABLE_ROLES = [USER_ROLE.event_staff, USER_ROLE.admin] as const;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;
const PASSWORD_ENV = "CREATE_USER_PASSWORD";

function roleOption(value: string): UserRole {
  const role = ASSIGNABLE_ROLES.find((candidate) => candidate === value);

  if (role === undefined) {
    throw new Error(`Invalid role: ${value}`);
  }

  return role;
}

/** `undefined` leaves the account without a credential, as before. */
export function passwordOption(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value.length < MIN_PASSWORD_LENGTH || value.length > MAX_PASSWORD_LENGTH) {
    throw new Error(`Password must be ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} characters.`);
  }

  return value;
}

const db = drizzle({
  get: () => Promise.resolve(undefined),
  all: () => Promise.resolve([]),
  run: () => Promise.resolve(undefined),
});

interface CredentialInput {
  email: string;
  password: string;
  accountId: string;
  now: Date;
}

/**
 * Credential writes for the user with `email`. Existing credential rows are
 * updated; a missing one is inserted using the user's resolved id (which may
 * be the pre-existing id when the user row was only updated).
 */
export async function credentialStatements(input: CredentialInput): Promise<string[]> {
  const { email, password, accountId, now } = input;
  const { hashPassword } = cliPasswordHashers();
  const passwordHash = await hashPassword(password);
  const timestamp = now.getTime();
  const emailMatch = eq(user.email, email);
  const userIdQuery = db.select({ id: user.id }).from(user).where(emailMatch);
  const isCredential = eq(account.providerId, "credential");
  const update = db.update(account).set({ password: passwordHash, updatedAt: now });
  const updateQuery = update.where(and(isCredential, inArray(account.userId, userIdQuery)));

  return [
    toSqlStatement(updateQuery.getSQL()),
    toSqlStatement(
      sql`insert into ${account} (id, account_id, provider_id, user_id, password, created_at, updated_at) select ${accountId}, ${accountId}, ${"credential"}, ${user.id}, ${passwordHash}, ${timestamp}, ${timestamp} from ${user} where ${user.email} = ${email} and not exists (select 1 from ${account} where ${account.userId} = ${user.id} and ${account.providerId} = ${"credential"})`,
    ),
  ];
}

export default defineBackfill({
  description: "Create or update a staff/admin account, optionally with a password.",
  usage:
    "bun manage.ts create-user --target local -- <email> [--role event_staff|admin] [--password <password>]",
  run: async (context, args) => {
    const { values, positionals } = parseArgs({
      args,
      allowPositionals: true,
      options: {
        role: { type: "string", default: "event_staff" },
        password: { type: "string" },
      },
      strict: true,
    });
    const email = positionals[0]?.trim().toLowerCase() ?? "";

    if (!EMAIL_REGEX.test(email)) {
      throw new Error("Enter a valid email address.");
    }

    const role = roleOption(values.role);
    const envPassword = process.env[PASSWORD_ENV];
    const password = passwordOption(
      values.password ?? (envPassword === "" ? undefined : envPassword),
    );
    const now = new Date();
    const query = db
      .insert(user)
      .values({
        id: newId(),
        name: email,
        email,
        createdAt: now,
        updatedAt: now,
        role,
      })
      .onConflictDoUpdate({
        target: user.email,
        set: { role: sql`excluded.role` },
      })
      .getSQL();
    const statements = [
      toSqlStatement(query),
      ...(password === undefined
        ? []
        : await credentialStatements({ email, password, accountId: newId(), now })),
    ];
    const d1 = await createD1Context(context.target, context.dryRun, context.log);

    d1.log(
      `Creating ${role} ${email} on ${d1.target}${password === undefined ? " without a password" : " with a password"}.`,
    );
    await d1.database.execute("APP_DB", statements.join("\n"));
    d1.log(`${role} ${email} created.`);
    if (password === undefined) {
      d1.log("Set a password in Admin > Users before this account can sign in.");
    }
  },
});
