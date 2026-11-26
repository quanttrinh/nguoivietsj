// @boundary shared
const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/**
 * Return a render-safe absolute URL, or `null` when the value is not an
 * http(s) or mailto URL.
 *
 * Write-time validation can be bypassed by legacy rows, imports, or direct
 * database edits, so callers must also check before rendering a value as an
 * `href`.
 */
export function safeExternalUrl(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  try {
    return SAFE_PROTOCOLS.has(new URL(trimmed).protocol) ? trimmed : null;
  } catch {
    return null;
  }
}
