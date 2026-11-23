// @boundary server
import { parseArgs } from "node:util";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/sqlite-proxy";

import { createD1Context } from "#tooling/d1/d1";
import { toSqlStatement } from "#tooling/d1/sql";
import { defineBackfill } from "#tooling/manage/backfill";

import { user } from "../../db/app/schemas/auth-schema";
import { EMAIL_REGEX } from "../../events/domain/patterns";

const db = drizzle({
  get: () => Promise.resolve(undefined),
  all: () => Promise.resolve([]),
  run: () => Promise.resolve(undefined),
});

function requiredOption(value: string | undefined) {
  if (value !== "true" && value !== "false") {
    throw new Error("Pass --required true or --required false.");
  }

  return value === "true";
}

/** SQL that sets the enrollment requirement for the user with `email`. */
export function setRequiredSql(email: string, required: boolean, now: Date): string {
  const update = db.update(user).set({ twoFactorRequired: required, updatedAt: now });
  const query = update.where(eq(user.email, email));

  return toSqlStatement(query.getSQL());
}

export default defineBackfill({
  description: "Set whether a user must enroll in two-factor auth.",
  usage:
    "bun manage.ts backfill two-factor-required --target staging -- <email> [--required true|false]",
  run: async (context, args) => {
    const { values, positionals } = parseArgs({
      args,
      allowPositionals: true,
      options: {
        required: { type: "string" },
      },
      strict: true,
    });
    const email = positionals[0]?.trim().toLowerCase() ?? "";

    if (!EMAIL_REGEX.test(email)) {
      throw new Error("Enter a valid email address.");
    }

    const required = requiredOption(values.required);
    const sql = setRequiredSql(email, required, new Date());
    const d1 = await createD1Context(context.target, context.dryRun, context.log);

    d1.log(`Setting two-factor required=${required} for ${email} on ${d1.target}.`);
    await d1.database.execute("APP_DB", sql);
    d1.log("Updated. The change takes effect on the user's next sign-in.");
  },
});
