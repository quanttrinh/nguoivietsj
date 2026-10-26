import { EVENT_SLUG_REGEX } from "~/shared/constants/patterns";
import { isUuidV7 } from "~/shared/utils/uuid";

function param(params: Record<string, string | undefined>, key: string): string {
  return params[key] ?? "";
}

export function eventIdFromParams(params: Record<string, string | undefined>): string | null {
  const id = param(params, "id");
  return isUuidV7(id) ? id : null;
}

export function registrationIdFromParams(
  params: Record<string, string | undefined>,
): string | null {
  const id = param(params, "registrationId");
  return isUuidV7(id) ? id : null;
}

export function eventSlugFromParams(params: Record<string, string | undefined>): string | null {
  const slug = param(params, "slug");
  return EVENT_SLUG_REGEX.test(slug) ? slug : null;
}
