import { v7 as uuidv7, validate as uuidValidate, version as uuidVersion } from "uuid";

/**
 * Generate a time-ordered UUID v7 for persisted records. Use this instead of
 * `crypto.randomUUID()` (UUID v4) so IDs sort by creation time.
 */
export function newId(): string {
  return uuidv7();
}

/** True for a syntactically valid UUID v7. */
export function isUuidV7(value: string): boolean {
  return uuidValidate(value) && uuidVersion(value) === 7;
}
