// @boundary client
import { isRecord } from "~/shared/utils/records";

import { authClient } from "./client";

export interface SharedSessionUser {
  role?: string | null;
  [key: string]: unknown;
}

export interface SharedSessionResult {
  data: { user: SharedSessionUser } | null;
  error: { message?: string } | null;
}

const SESSION_TTL_MS = 60_000;
const SESSION_HINT_KEY = "admin-session-hint";
const SESSION_HINT_TTL_MS = 60_000;

let cached: { result: SharedSessionResult; at: number } | null = null;
let pending: Promise<SharedSessionResult> | null = null;

function clearSessionHint(): void {
  try {
    globalThis.sessionStorage.removeItem(SESSION_HINT_KEY);
  } catch {
    // Storage can be unavailable in private or restricted contexts.
  }
}

function rememberSessionHint(): void {
  try {
    globalThis.sessionStorage.setItem(SESSION_HINT_KEY, String(Date.now()));
  } catch {
    // Storage can be unavailable in private or restricted contexts.
  }
}

/** Whether this tab recently confirmed an authenticated session. */
export function hasRecentSessionHint(): boolean {
  try {
    const raw = globalThis.sessionStorage.getItem(SESSION_HINT_KEY);
    const at = raw === null ? Number.NaN : Number(raw);

    return Number.isFinite(at) && Date.now() - at < SESSION_HINT_TTL_MS;
  } catch {
    return false;
  }
}

function normalizeSession(raw: unknown): SharedSessionResult {
  if (!isRecord(raw)) {
    return { data: null, error: null };
  }

  const user = isRecord(raw.data) && isRecord(raw.data.user) ? raw.data.user : null;

  let error: SharedSessionResult["error"] = null;

  if (isRecord(raw.error)) {
    error = typeof raw.error.message === "string" ? { message: raw.error.message } : {};
  }

  return {
    data: user === null ? null : { user },
    error,
  };
}

/**
 * Share the current session across admin islands and client navigations.
 *
 * Without this, the auth gate, logout button, and admin home cards each issue
 * a separate `/api/auth/get-session` request.
 */
export async function getSharedSession(): Promise<SharedSessionResult> {
  if (cached !== null && Date.now() - cached.at < SESSION_TTL_MS) {
    return cached.result;
  }

  if (pending !== null) {
    return pending;
  }

  const request = (async (): Promise<SharedSessionResult> => {
    const raw: unknown = await authClient.getSession();
    const result = normalizeSession(raw);

    cached = result.error ? null : { result, at: Date.now() };

    if (result.error === null) {
      if (result.data === null) {
        clearSessionHint();
      } else {
        rememberSessionHint();
      }
    }

    return result;
  })();

  pending = request;

  try {
    return await request;
  } finally {
    pending = null;
  }
}

/** Drop the shared session after sign-in or sign-out. */
export function clearSharedSession(): void {
  cached = null;
  pending = null;
  clearSessionHint();
}
