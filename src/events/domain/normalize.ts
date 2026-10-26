const DEFAULT_COUNTRY_CODE = "1";

/** Normalize names for duplicate detection and staff search. */
export function normalizeFullName(value: string): string {
  return value
    .normalize("NFKD")
    .replaceAll(/\p{M}/gu, "")
    .toLowerCase()
    .replaceAll(/\s+/gu, " ")
    .trim();
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** Store phone numbers in a canonical E.164-style form. */
export function normalizePhone(value: string): string {
  const digits = value.replaceAll(/\D/gu, "");

  if (digits.length === 10) {
    return `+${DEFAULT_COUNTRY_CODE}${digits}`;
  }

  if (digits.length === 11 && digits.startsWith(DEFAULT_COUNTRY_CODE)) {
    return `+${digits}`;
  }

  return `+${digits}`;
}

export function normalizeProvince(value: string): string {
  return value.trim().toUpperCase();
}

export function normalizePostalCode(value: string): string {
  return value.trim().toUpperCase();
}

export function normalizeCountry(value: string): string {
  return value.trim().toUpperCase();
}
