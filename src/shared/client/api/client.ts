// @boundary client
import { resolveBrowserLocale } from "@intlayer/core/localization";
import { hc } from "hono/client";

import { isRecord } from "~/shared/utils/records";
/* oxlint-disable import/consistent-type-specifier-style -- keep the type-only import stripped in dev. */
import type { ApiAppType } from "~/types/api";

/** Typed Hono RPC client for same-origin API requests. */
export const apiClient = hc<ApiAppType>("/", {
  headers: () => ({ "x-locale": resolveBrowserLocale() }),
});

interface SuccessJsonResponse<TData> {
  ok: true;
  json: () => Promise<TData>;
}

interface ErrorJsonResponse {
  ok: false;
  status: number;
  json: () => Promise<unknown>;
}

/** An API failure that retains the server's localized message. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly serverMessage: string | null;

  constructor(status: number, serverMessage: string | null) {
    super(String(status));
    this.name = "ApiRequestError";
    this.status = status;
    this.serverMessage = serverMessage;
  }
}

/** Read a successful typed RPC response, preserving the HTTP status on failure. */
export async function readApiJson<TData>(
  response: SuccessJsonResponse<TData> | ErrorJsonResponse,
): Promise<TData> {
  if (!response.ok) {
    let serverMessage: string | null = null;

    try {
      const body: unknown = await response.json();

      if (isRecord(body)) {
        if (isRecord(body.error) && typeof body.error.message === "string") {
          serverMessage = body.error.message;
        } else if (typeof body.message === "string") {
          serverMessage = body.message;
        }
      }
    } catch {
      // Keep the status-only fallback when the error body is not JSON.
    }

    throw new ApiRequestError(response.status, serverMessage);
  }

  return response.json();
}

/** Prefer a server response's localized message, otherwise use a generic fallback. */
export function apiResponseMessage(body: unknown, fallback: string): string {
  if (isRecord(body)) {
    if (
      isRecord(body.error) &&
      typeof body.error.message === "string" &&
      body.error.message.length > 0
    ) {
      return body.error.message;
    }

    if (typeof body.message === "string" && body.message.length > 0) {
      return body.message;
    }
  }

  return fallback;
}

/** Prefer the server's localized message and fall back to a generic local error. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiRequestError && error.serverMessage !== null) {
    return error.serverMessage;
  }

  return fallback;
}
