// @boundary shared
import { type } from "arktype";
import { locales } from "intlayer";

/**
 * Validates a locale path segment.
 *
 * Kept separate from `locales.ts` so importing locale constants does not pull
 * ArkType into client bundles.
 */
export const localeSchema = type.enumerated(...locales);
