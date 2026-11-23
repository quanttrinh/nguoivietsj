// @boundary server
import { normalizeFullName } from "~/events/domain/normalize";

/**
 * Build a conservative FTS5 prefix query from staff input.
 *
 * Only letters/numbers survive tokenization, so FTS operators and punctuation
 * cannot be injected. Every token is treated as a required prefix.
 */
export function fullTextSearchQuery(query: string): string | null {
  const tokens = normalizeFullName(query)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0);

  return tokens.length === 0 ? null : tokens.map((token) => `${token}*`).join(" ");
}

/**
 * Phone numbers are FTS tokens like `+15065550105`, so a national or partial
 * number never matches a prefix query. For digit-only input (ignoring common
 * punctuation), return the digits for a substring match against stored phones.
 */
export function phoneSearchDigits(query: string): string | null {
  if (/\p{L}/u.test(query)) {
    return null;
  }

  const digits = query.replaceAll(/\D/gu, "");

  return digits.length >= 3 ? digits : null;
}
