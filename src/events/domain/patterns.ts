// @boundary shared
/** Event-engine contact, currency, and identifier patterns. */

import { MAX_CURRENCY_CODE_LENGTH } from "~/events/domain/limits";

// Contact formats

export const EMAIL_PATTERN = String.raw`[^\s@]+@[^\s@]+\.[^\s@]+`;

export const EMAIL_REGEX = new RegExp(`^${EMAIL_PATTERN}$`, "u");

// At least 10 and at most 15 digits, with optional spaces, parentheses, dots, hyphens, and a leading plus.
const PHONE_BODY = String.raw`(?=(?:\D*\d){10,15}\D*$)\+?[\d\s().-]+`;

export const PHONE_REGEX = new RegExp(`^${PHONE_BODY}$`, "u");

/** Display mask for North American phone numbers. `#` matches a digit. */
export const PHONE_MASK = "(###) ###-####";

/** Canadian postal code format used by registration mail contacts. */
export const POSTAL_CODE_REGEX = /^[A-Z]\d[A-Z] \d[A-Z]\d$/u;

export const CURRENCY_REGEX = new RegExp(`^[A-Z]{${MAX_CURRENCY_CODE_LENGTH}}$`, "u");

/**
 * One or more name words. Each word starts with a Unicode letter and may
 * contain combining marks. Words may be separated by spaces, apostrophes,
 * or hyphens. Digits and other symbols are rejected.
 */
export const FULL_NAME_REGEX = /^\p{L}[\p{L}\p{M}]*(?:[ '’-]+\p{L}[\p{L}\p{M}]*)*$/u;

// Event-engine identifiers

export const EVENT_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
export const EVENT_TYPE_REGEX = /^[a-z][a-z0-9-]*$/u;
export const FORM_KEY_REGEX = /^[a-z][a-zA-Z0-9_]{0,63}$/u;
export const FORM_REF_REGEX = /^[a-z][a-zA-Z0-9_.]{0,159}$/u;
export const TICKET_KEY_REGEX = /^[a-z][a-z0-9_]{0,63}$/u;
