import { hashPassword as hashScryptPassword } from "better-auth/crypto";
import { describe, expect, test } from "vitest";

import {
  createPasswordHashers,
  type PasswordHashConfig,
} from "../../../../src/auth/server/password";

const config: PasswordHashConfig = {
  iterations: 1000,
  saltBytes: 8,
  keyBits: 128,
  prefix: "pbkdf2_test",
  pepper: "cGVwcGVyLXZhbHVlLTEyMzQ",
};

const { hashPassword, verifyPassword } = createPasswordHashers(config);

describe("PBKDF2 password hashing", () => {
  test("round-trips and rejects a wrong password", async () => {
    const hash = await hashPassword("correct horse battery staple");

    expect(hash).toMatch(/^pbkdf2_test\$1000\$[\w-]{11}\$[\w-]{22}$/u);
    await expect(verifyPassword({ hash, password: "correct horse battery staple" })).resolves.toBe(
      true,
    );
    await expect(verifyPassword({ hash, password: "wrong" })).resolves.toBe(false);
  });

  test("uses a fresh salt for every hash", async () => {
    await expect(hashPassword("same")).resolves.not.toBe(await hashPassword("same"));
  });

  test("rejects Better Auth's default scrypt format", async () => {
    const scrypt = await hashScryptPassword("password");

    await expect(verifyPassword({ hash: scrypt, password: "password" })).resolves.toBe(false);
  });

  test("rejects malformed hashes", async () => {
    for (const hash of [
      "pbkdf2_test$0$AA$AA",
      "pbkdf2_test$abc$AA$AA",
      "pbkdf2_test$1000$!!$AA",
      "pbkdf2_test$1000$AA$AA$AA",
      "pbkdf2_test$1000$AA",
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- tiny fixed list.
      await expect(verifyPassword({ hash, password: "x" })).resolves.toBe(false);
    }
  });
});
