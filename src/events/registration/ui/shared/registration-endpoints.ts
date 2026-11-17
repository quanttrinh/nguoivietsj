// @boundary client
import type { Props } from "./registration-types";

export type RegistrationRequest =
  | { kind: "public"; slug: string; locale: string }
  | { kind: "preview"; eventId: string; locale: string; version: string | null }
  | { kind: "staff"; eventId: string; locale: string; version: string | null };

export function registrationRequest(
  props: Props,
  params: URLSearchParams,
): RegistrationRequest | null {
  if (props.preview === true || props.staff === true) {
    const eventId = params.get("event");

    if (eventId === null) {
      return null;
    }

    return {
      kind: props.staff === true ? "staff" : "preview",
      eventId,
      locale: props.config.locale,
      version: params.get("version"),
    };
  }

  const slug = params.get("slug");

  if (slug === null || slug.length === 0) {
    return null;
  }

  return { kind: "public", slug, locale: props.config.locale };
}
