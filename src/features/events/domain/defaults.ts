// @boundary shared
/** Event-engine defaults and the ISO 4217 currency allowlist. */

export const DEFAULT_TIMEZONE = "UTC";
export const DEFAULT_CURRENCY = "CAD";

/** Currency codes accepted by event validation, with a runtime fallback. */
export const SUPPORTED_CURRENCY_CODES: ReadonlySet<string> = (() => {
  try {
    return new Set(Intl.supportedValuesOf("currency"));
  } catch {
    return new Set([
      "AED",
      "AUD",
      "BRL",
      "CAD",
      "CHF",
      "CNY",
      "CZK",
      "DKK",
      "EUR",
      "GBP",
      "HKD",
      "HUF",
      "IDR",
      "ILS",
      "INR",
      "JPY",
      "KRW",
      "MXN",
      "MYR",
      "NOK",
      "NZD",
      "PHP",
      "PLN",
      "RON",
      "SEK",
      "SGD",
      "THB",
      "TRY",
      "TWD",
      "UAH",
      "USD",
      "VND",
      "ZAR",
    ]);
  }
})();
