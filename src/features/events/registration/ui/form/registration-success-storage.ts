// @boundary client
import type { ApiIssue } from "~/platform/contracts/response";
import { isRecord } from "~/platform/utils/records";

import type { RegistrationSuccess } from "./registration-submit";

const STORAGE_PREFIX = "engine-registration-success";

function storageKey(staff: boolean, eventId: string) {
  return `${STORAGE_PREFIX}:${staff ? "staff" : "public"}:${eventId}`;
}

/** Read a completed registration from this tab, if its URL still marks it complete. */
export function readRegistrationSuccess(
  staff: boolean,
  eventId: string,
): RegistrationSuccess | null {
  if (!("sessionStorage" in globalThis)) {
    return null;
  }

  try {
    const raw = globalThis.sessionStorage.getItem(storageKey(staff, eventId));

    if (raw === null) {
      return null;
    }

    const value: unknown = JSON.parse(raw);

    if (
      !isRecord(value) ||
      typeof value.id !== "string" ||
      typeof value.emailQueued !== "boolean" ||
      (value.statusUrl !== undefined && typeof value.statusUrl !== "string")
    ) {
      return null;
    }

    const warnings: ApiIssue[] = Array.isArray(value.warnings)
      ? value.warnings.flatMap((warning) => {
          if (!isRecord(warning) || typeof warning.code !== "string") {
            return [];
          }

          return [
            {
              code: warning.code,
              ...(typeof warning.message === "string" ? { message: warning.message } : {}),
              ...(typeof warning.path === "string" ? { path: warning.path } : {}),
              ...(typeof warning.ref === "string" ? { ref: warning.ref } : {}),
            },
          ];
        })
      : [];

    return {
      id: value.id,
      statusUrl: typeof value.statusUrl === "string" ? value.statusUrl : undefined,
      emailQueued: value.emailQueued,
      warnings:
        warnings.length === 0 && !value.emailQueued
          ? [{ code: "event_registration_email_not_queued" }]
          : warnings,
    };
  } catch {
    return null;
  }
}

/** Persist the completed registration so a reload keeps the confirmation view. */
export function writeRegistrationSuccess(
  staff: boolean,
  eventId: string,
  success: RegistrationSuccess,
): void {
  if (!("sessionStorage" in globalThis)) {
    return;
  }

  try {
    globalThis.sessionStorage.setItem(storageKey(staff, eventId), JSON.stringify(success));
  } catch {
    // Storage can be unavailable in private or restricted browsing contexts.
  }
}

/** Mark the current URL as the completed view without adding a history entry. */
export function markRegistrationCompleteUrl(): void {
  if (!("history" in globalThis)) {
    return;
  }

  const url = new URL(globalThis.location.href);
  url.searchParams.set("registered", "1");
  globalThis.history.replaceState(globalThis.history.state, "", url);
}
