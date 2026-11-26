// @boundary client
import { hc } from "hono/client";

import type { ApiMeta, ApiPagination } from "~/shared/api/response";
import { resolveBrowserLocale } from "~/shared/i18n";
import { isRecord } from "~/shared/utils/records";
import type { ApiAppType } from "~/types/api";

let unauthorizedHandler: (() => void) | null = null;

/** Register a callback that runs when an API request returns 401. */
export function setUnauthorizedHandler(handler: () => void): void {
  unauthorizedHandler = handler;
}

async function fetchWithUnauthorizedReset(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await globalThis.fetch(input, init);

  if (response.status === 401) {
    unauthorizedHandler?.();
  }

  return response;
}

/** Typed Hono RPC client for same-origin API requests. */
export const apiClient = hc<ApiAppType>("/", {
  headers: () => ({ "x-locale": resolveBrowserLocale() }),
  fetch: fetchWithUnauthorizedReset,
  init: { credentials: "same-origin" },
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

/** Read the exact pagination block from a paginated endpoint's server meta. */
export function requirePagination(meta: ApiMeta): ApiPagination {
  const pagination = meta.pagination;

  if (pagination === undefined) {
    throw new Error("Paginated API response is missing pagination metadata");
  }

  return pagination;
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
