// @boundary server
import { type } from "arktype";
import { constantTimeEqual } from "better-auth/crypto";
import { base64url } from "jose";

import { TEXT_ENCODER } from "~/shared/utils/text-coding";

export interface PasswordHashConfig {
  iterations: number;
  saltBytes: number;
  keyBits: number;
  prefix: string;
  pepper: string;
}

const configSchema = type("string.json.parse").to({
  iterations: "number.integer > 0 & number.integer <= 100000",
  saltBytes: "number.integer >= 8",
  keyBits: "number.integer >= 128",
  prefix: "string > 0",
  pepper: "string > 0",
});

/** Parse the deployment's password-hashing configuration secret. */
export function parsePasswordHashConfig(secret: string): PasswordHashConfig {
  const config = configSchema(secret);

  if (config instanceof type.errors) {
    throw new TypeError("Invalid password hashing configuration");
  }

  if (config.prefix.includes("$")) {
    throw new TypeError("Invalid password hashing configuration");
  }

  try {
    if (base64url.decode(config.pepper).length < 16) {
      throw new TypeError("Invalid password hashing configuration");
    }
  } catch {
    throw new TypeError("Invalid password hashing configuration");
  }

  return config;
}

interface Pbkdf2Hash {
  iterations: number;
  salt: string;
  key: string;
}

function parsePbkdf2Hash(hash: string, prefix: string): Pbkdf2Hash | null {
  const [hashPrefix, iterations, salt, key, ...rest] = hash.split("$");

  if (
    hashPrefix !== prefix ||
    iterations === undefined ||
    !/^[1-9]\d*$/u.test(iterations) ||
    salt === undefined ||
    key === undefined ||
    rest.length > 0
  ) {
    return null;
  }

  return { iterations: Number(iterations), salt, key };
}

/** Build password hash/verify functions for a deployment's configuration. */
export function createPasswordHashers(config: PasswordHashConfig) {
  const pepperKey = crypto.subtle.importKey(
    "raw",
    new Uint8Array(base64url.decode(config.pepper)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  async function derive(
    password: string,
    salt: Uint8Array<ArrayBuffer>,
    iterations: number,
  ): Promise<Uint8Array> {
    const peppered = await crypto.subtle.sign(
      "HMAC",
      await pepperKey,
      TEXT_ENCODER.encode(password.normalize("NFKC")),
    );
    const key = await crypto.subtle.importKey("raw", peppered, "PBKDF2", false, ["deriveBits"]);

    return new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: "PBKDF2", hash: "SHA-256", salt, iterations },
        key,
        config.keyBits,
      ),
    );
  }

  async function hashPassword(password: string): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(config.saltBytes));
    const key = await derive(password, salt, config.iterations);

    return [config.prefix, config.iterations, base64url.encode(salt), base64url.encode(key)].join(
      "$",
    );
  }

  async function verifyPassword(input: { hash: string; password: string }): Promise<boolean> {
    const parsed = parsePbkdf2Hash(input.hash, config.prefix);

    if (parsed === null) {
      return false;
    }

    try {
      const salt = new Uint8Array(base64url.decode(parsed.salt));
      const key = await derive(input.password, salt, parsed.iterations);

      return constantTimeEqual(key, base64url.decode(parsed.key));
    } catch {
      return false;
    }
  }

  return { hashPassword, verifyPassword };
}
