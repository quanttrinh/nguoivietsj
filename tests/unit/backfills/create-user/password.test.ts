import { describe, expect, test } from "vitest";

import {
  createPasswordHashers,
  type PasswordHashConfig,
} from "../../../../src/auth/server/password";
import { credentialStatements, passwordOption } from "../../../../src/backfills/create-user";

process.env.AUTH_PASSWORD_CONFIG =
  '{"iterations":1000,"saltBytes":8,"keyBits":128,"prefix":"pbkdf2_test","pepper":"cGVwcGVyLXZhbHVlLTEyMzQ"}';

const config: PasswordHashConfig = {
  iterations: 1000,
  saltBytes: 8,
  keyBits: 128,
  prefix: "pbkdf2_test",
  pepper: "cGVwcGVyLXZhbHVlLTEyMzQ",
};
const { verifyPassword } = createPasswordHashers(config);

const EMAIL = "admin@example.com";
const PASSWORD = "a-strong-staging-password";

describe("create-user password", () => {
  test("accepts an optional password within the configured bounds", () => {
    expect(passwordOption(PASSWORD)).toBe(PASSWORD);
    expect(passwordOption(undefined)).toBeUndefined();
  });

  test("rejects passwords outside the configured bounds", () => {
    expect(() => passwordOption("short")).toThrow(/12-128/u);
    expect(() => passwordOption("x".repeat(129))).toThrow(/12-128/u);
  });

  test("writes a verifiable hash without leaking the plaintext password", async () => {
    const statements = await credentialStatements({
      email: EMAIL,
      password: PASSWORD,
      accountId: "account-1",
      now: new Date("2026-01-01T00:00:00Z"),
    });

    expect(statements).toHaveLength(2);
    const sql = statements.join("\n");
    expect(sql).toContain('update "account" set "password"');
    expect(sql).toContain('insert into "account"');
    expect(sql).toContain("not exists");
    expect(sql).not.toContain(PASSWORD);

    const hash = /set "password" = '(?<hash>pbkdf2_test\$[^']+)'/u.exec(sql)?.groups?.hash;
    expect(hash).toBeDefined();
    await expect(verifyPassword({ hash: hash ?? "", password: PASSWORD })).resolves.toBe(true);
  });

  test("binds the credential account_id to the user id so sign-in finds it", async () => {
    const statements = await credentialStatements({
      email: EMAIL,
      password: PASSWORD,
      accountId: "account-1",
      now: new Date("2026-01-01T00:00:00Z"),
    });

    const sql = statements.join("\n");
    expect(sql).toContain(
      `insert into "account" (id, account_id, provider_id, user_id, password, created_at, updated_at) select 'account-1', "user"."id", 'credential', "user"."id",`,
    );
  });
});
