// @boundary shared
/** Shared locale-aware formatting helpers. */

const MAX_CACHED_FORMATTERS = 100;

const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>();
const moneyFormatters = new Map<string, Intl.NumberFormat>();

function cacheKey(locale: string, suffix: string): string {
  return `${locale}\u0000${suffix}`;
}

function cached<TValue>(cache: Map<string, TValue>, key: string, create: () => TValue): TValue {
  const existing = cache.get(key);

  if (existing !== undefined) {
    // Refresh insertion order so the least recently used formatter is evicted first.
    cache.delete(key);
    cache.set(key, existing);
    return existing;
  }

  const created = create();
  cache.set(key, created);

  while (cache.size > MAX_CACHED_FORMATTERS) {
    const oldest = cache.keys().next().value;

    if (oldest === undefined) {
      break;
    }

    cache.delete(oldest);
  }

  return created;
}

function createDateTimeFormatter(
  locale: string,
  timeZone: string | undefined,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat(locale, {
      ...options,
      ...(timeZone === undefined ? {} : { timeZone }),
    });
  } catch {
    // A bad time zone is the common data error.
    // Retry without it before giving up on the caller's locale.
    try {
      return new Intl.DateTimeFormat(locale, options);
    } catch {
      // The locale is also invalid.
      // Fall back to the runtime default locale and preserve a valid time zone.
      try {
        return new Intl.DateTimeFormat(undefined, {
          ...options,
          ...(timeZone === undefined ? {} : { timeZone }),
        });
      } catch {
        return new Intl.DateTimeFormat(undefined, options);
      }
    }
  }
}

function createMoneyFormatter(locale: string, currency: string): Intl.NumberFormat {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency });
  } catch {
    // Invalid currency or locale.
    // A decimal formatter still renders an amount that callers can display.
    const decimalOptions: Intl.NumberFormatOptions = {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    };

    try {
      return new Intl.NumberFormat(locale, decimalOptions);
    } catch {
      return new Intl.NumberFormat(undefined, decimalOptions);
    }
  }
}

export function dateFormatter(locale: string, timeZone?: string): Intl.DateTimeFormat {
  return cached(dateFormatters, cacheKey(locale, timeZone ?? ""), () =>
    createDateTimeFormatter(locale, timeZone, { dateStyle: "medium" }),
  );
}

export function dateTimeFormatter(locale: string, timeZone?: string): Intl.DateTimeFormat {
  return cached(dateTimeFormatters, cacheKey(locale, timeZone ?? ""), () =>
    createDateTimeFormatter(locale, timeZone, {
      dateStyle: "medium",
      timeStyle: "short",
    }),
  );
}

export function moneyFormatter(locale: string, currency: string): Intl.NumberFormat {
  return cached(moneyFormatters, cacheKey(locale, currency), () =>
    createMoneyFormatter(locale, currency),
  );
}

export function formatMoney(amountMinor: number, locale: string, currency: string): string {
  const amount = amountMinor / 100;

  try {
    const formatter = moneyFormatter(locale, currency);
    const formatted = formatter.format(amount);

    // When the currency code was rejected, the cached formatter is decimal.
    // Append the original code so the amount is still unambiguous.
    return formatter.resolvedOptions().style === "currency"
      ? formatted
      : `${formatted} ${currency}`;
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
