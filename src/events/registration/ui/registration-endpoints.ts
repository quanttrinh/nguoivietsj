import type { Props } from "./registration-types";

function publicEventEndpoint(slug: string, locale: string): string {
  return `/api/events/public/events/${encodeURIComponent(slug)}?locale=${encodeURIComponent(locale)}`;
}
export function registrationEndpoint(props: Props, params: URLSearchParams): string | null {
  if (props.preview === true) {
    const eventId = params.get("event");
    if (eventId === null) {
      return null;
    }
    const version = params.get("version");
    const suffix = version === null ? "" : `&version=${encodeURIComponent(version)}`;
    return `/api/events/admin/events/${encodeURIComponent(eventId)}/preview?locale=${encodeURIComponent(props.config.locale)}${suffix}`;
  }
  const slug = params.get("slug");
  if (slug === null || slug.length === 0) {
    return null;
  }
  return publicEventEndpoint(slug, props.config.locale);
}

/** Render the static public registration page. */
