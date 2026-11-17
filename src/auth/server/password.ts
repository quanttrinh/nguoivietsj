// @boundary server
import { constantTimeEqual } from "better-auth/crypto";
import { base64url } from "jose";

/**
 * Workers Free allows 10 ms CPU per request. Better Auth's default scrypt
 * implementation costs about 80 ms, so staff passwords use WebCrypto PBKDF2.
 *
 * 20,000 iterations is a deliberate CPU-budget trade-off. It is well below
 * OWASP's 600,000 recommendation for PBKDF2-HMAC-SHA256, so offline resistance
 * relies on strong staff passwords, and online guessing is bounded by Better
 * Auth rate limiting and the WAF rule. The iteration count is stored in each
 * hash, so it can be raised later without invalidating existing passwords.
 *
 * Format: `pbkdf2_sha256$<iterations>$<salt>$<key>`, with base64url salt and key.
 */
const PBKDF2_ITERATIONS = 20_000;
const PBKDF2_SALT_BYTES = 16;
const PBKDF2_KEY_BITS = 256;
const PREFIX = "pbkdf2_sha256";

interface Pbkdf2Hash {
  iterations: number;
  salt: string;
  key: string;
}

function parsePbkdf2Hash(hash: string): Pbkdf2Hash | null {
  const [prefix, iterations, salt, key, ...rest] = hash.split("$");

  if (
    prefix !== PREFIX ||
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

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password.normalize("NFKC")),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: new Uint8Array(salt), iterations },
      key,
      PBKDF2_KEY_BITS,
    ),
  );
}

/** Hash a password for Better Auth email/password sign-in. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES));
  const key = await derive(password, salt, PBKDF2_ITERATIONS);

  return [PREFIX, PBKDF2_ITERATIONS, base64url.encode(salt), base64url.encode(key)].join("$");
}

/** Verify a password against a stored PBKDF2 hash. */
export async function verifyPassword(input: { hash: string; password: string }): Promise<boolean> {
  const parsed = parsePbkdf2Hash(input.hash);

  if (parsed === null) {
    return false;
  }

  try {
    const key = await derive(input.password, base64url.decode(parsed.salt), parsed.iterations);

    return constantTimeEqual(key, base64url.decode(parsed.key));
  } catch {
    return false;
  }
}
