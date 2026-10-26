function pad(part: number): string {
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
