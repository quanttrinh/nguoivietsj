/** Shared locale-aware formatting helpers. */

export function dateFormatter(locale: string, timeZone?: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    ...(timeZone === undefined ? {} : { timeZone }),
  });
}

export function dateTimeFormatter(locale: string, timeZone?: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    ...(timeZone === undefined ? {} : { timeZone }),
  });
}

export function moneyFormatter(locale: string, currency: string): Intl.NumberFormat {
  return new Intl.NumberFormat(locale, { style: "currency", currency });
}

export function formatMoney(amountMinor: number, locale: string, currency: string): string {
  try {
    return moneyFormatter(locale, currency).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${currency}`;
  }
}
