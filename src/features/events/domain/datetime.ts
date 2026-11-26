// @boundary shared
function pad(part: number) {
  return String(part).padStart(2, "0");
}

/** Format an ISO timestamp for a datetime-local input. */
export function toLocalDateTime(value: string | null): string {
  if (value === null || value.length === 0) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** Parse a datetime-local input value into an ISO timestamp. */
export function toIsoDateTime(value: string): string | null {
  if (value.length === 0) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Normalize an accepted timestamp to a UTC ISO 8601 string.
 *
 * Unparseable values are returned unchanged so callers can reject them with a
 * field error.
 */
export function toUtcTimestamp(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}
