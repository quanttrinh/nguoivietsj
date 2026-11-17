// @boundary shared
/** Registration status-page policy shared by UI, API, and server code. */

/** Number of digits in a registration status recovery code. */
export const STATUS_OTP_CODE_LENGTH = 6;

/** Seconds a status OTP remains valid. */
export const STATUS_OTP_TTL_SECONDS = 10 * 60;

/** Maximum failed OTP attempts before the code is locked. */
export const STATUS_OTP_MAX_ATTEMPTS = 5;

/** Minimum seconds between OTP resends. */
export const STATUS_OTP_RESEND_SECONDS = 60;

/** Maximum OTPs that may be issued for one registration in a rolling day. */
export const STATUS_OTP_DAILY_MAX = 10;

/** Rolling window used for the daily OTP cap. */
export const STATUS_OTP_DAILY_WINDOW_SECONDS = 24 * 60 * 60;

/** Seconds a status-page token remains valid. */
export const STATUS_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60;

/** Seconds an OTP-issued, single-use status-view token remains valid. */
export const STATUS_OTP_TOKEN_TTL_SECONDS = 10 * 60;

/** Regex matching a recovery code with the configured number of digits. */
export const STATUS_OTP_CODE_REGEX = new RegExp(`^\\d{${STATUS_OTP_CODE_LENGTH}}$`, "u");

/** Opaque status-page token format issued by `makeStatusToken`. */
export const STATUS_TOKEN_REGEX = /^[A-Za-z0-9_-]{20,100}$/u;
