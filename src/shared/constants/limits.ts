/** Generic hard limits shared across root-domain apps. */

/** Maximum full-name length accepted by forms and APIs. */
export const MAX_FULL_NAME_LENGTH = 200;

/** Maximum phone number length accepted by forms and APIs. */
export const MAX_PHONE_NUMBER_LENGTH = 40;

/** Maximum email address length accepted by forms and APIs. */
export const MAX_EMAIL_ADDRESS_LENGTH = 254;

/** Maximum address line length accepted by forms. */
export const MAX_ADDRESS_LINE_LENGTH = 200;

/** Maximum city length accepted by forms. */
export const MAX_CITY_LENGTH = 100;

/** Maximum Canadian postal code length, including the space. */
export const MAX_POSTAL_CODE_LENGTH = 7;

/** Maximum currency code length. */
export const MAX_CURRENCY_CODE_LENGTH = 3;

/** Length of a UUID v7 string, including hyphens. */
export const MAX_UUID_V7_LENGTH = 36;

/** Maximum Turnstile token length documented by Cloudflare. */
export const MAX_TURNSTILE_TOKEN_LENGTH = 2048;

/** Number of digits in a registration status recovery code. */
export const STATUS_OTP_CODE_LENGTH = 6;
