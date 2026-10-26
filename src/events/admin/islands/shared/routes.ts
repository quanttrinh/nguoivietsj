interface AdminEventUrlOptions {
  eventId: string;
  view?: string;
  params?: URLSearchParams;
}

/** Build a localized admin view path, e.g. `/en/events/admin/view/payments`. */
export function adminViewPath(locale: string, view = ""): string {
  return `/${locale}/events/admin/view${view.length > 0 ? `/${view}` : ""}`;
}

/** Build an admin event URL with the event id merged into any extra params. */
export function adminEventUrl(locale: string, options: AdminEventUrlOptions): string {
  const next = new URLSearchParams(options.params);
  next.set("event", options.eventId);
  return `${adminViewPath(locale, options.view ?? "")}?${next.toString()}`;
}
