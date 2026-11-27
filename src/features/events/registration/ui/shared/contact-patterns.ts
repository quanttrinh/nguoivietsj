// @boundary client
/** HTML pattern for email inputs; server-side validation uses ArkType's string.email. */
// oxlint-disable-next-line unicorn/prefer-string-raw
export const EMAIL_PATTERN = "[^\\s@]+@[^\\s@]+\\.[^\\s@]+";

/** Display mask for North American phone numbers. `#` matches a digit. */
export const PHONE_MASK = "(###) ###-####";
