export interface ApiErrorMessages {
  loadFailed: string;
  forbidden: string;
  notFound?: string;
}

/** Map an API failure to a translated message without repeating status checks. */
export function apiErrorMessage(error: unknown, messages: ApiErrorMessages): string {
  const status = error instanceof Error ? error.message : "";

  if (status === "403") {
    return messages.forbidden;
  }

  if (status === "404" && messages.notFound !== undefined) {
    return messages.notFound;
  }

  return messages.loadFailed;
}
