// @boundary client
interface AdminEventUrlOptions {
  eventId: string;
  view?: string;
  params?: URLSearchParams;
}

/** Localized app-wide administration home. */
export function adminHomeUrl(locale: string): string {
  return `/${locale}/admin`;
}

/** Localized user-management administration page. */
export function adminUsersUrl(locale: string): string {
  return `${adminHomeUrl(locale)}/users`;
}

/** Localized admin event catalog. */
export function adminCatalogUrl(locale: string): string {
  return `${adminHomeUrl(locale)}/events`;
}

/** Localized new-event form. */
export function adminNewEventUrl(locale: string): string {
  return `${adminCatalogUrl(locale)}/new`;
}

/** Build a localized admin view path, e.g. `/en/admin/events/view/payments`. */
function adminViewPath(locale: string, view = ""): string {
  return `${adminCatalogUrl(locale)}/view${view.length > 0 ? `/${view}` : ""}`;
}

/** Build an admin event URL with the event id merged into any extra params. */
export function adminEventUrl(locale: string, options: AdminEventUrlOptions): string {
  const next = new URLSearchParams(options.params);
  next.set("event", options.eventId);
  return `${adminViewPath(locale, options.view ?? "")}?${next.toString()}`;
}
