import { readControlChecked, readControlValue } from "~/shared/client/form-controls";
import { DATA_ATTRIBUTE_PREFIX_REGEX } from "~/shared/constants/patterns";

export function datasetKey(attribute: string): string {
  return attribute
    .replace(DATA_ATTRIBUTE_PREFIX_REGEX, "")
    .split("-")
    .map((part, index) => (index === 0 ? part : `${part.charAt(0).toUpperCase()}${part.slice(1)}`))
    .join("");
}

export function localizedFromDataset(card: Element, attribute: string): Record<string, string> {
  const values: Record<string, string> = {};
  const key = datasetKey(attribute);

  for (const field of card.querySelectorAll<HTMLElement>(`[${attribute}]`)) {
    const language = field.dataset[key];
    const value = readControlValue(field).trim();

    if (language !== undefined && value.length > 0) {
      values[language] = value;
    }
  }

  return values;
}

export function ticketValue(card: Element, field: string): string {
  return readControlValue(card.querySelector(`[data-ticket-field="${field}"]`)).trim();
}

export function ticketChecked(card: Element, field: string): boolean {
  return readControlChecked(card.querySelector(`[data-ticket-field="${field}"]`));
}

export function collectTicket(card: Element, includeKey: boolean): Record<string, unknown> {
  const max = ticketValue(card, "maxPerRegistration");
  const capacity = ticketValue(card, "capacity");
  const description = localizedFromDataset(card, "data-ticket-description");
  const ticket: Record<string, unknown> = {
    label: localizedFromDataset(card, "data-ticket-label"),
    description: Object.keys(description).length > 0 ? description : null,
    priceMinor: Number(ticketValue(card, "priceMinor")),
    minPerRegistration: Number(ticketValue(card, "minPerRegistration")),
    maxPerRegistration: max.length === 0 ? null : Number(max),
    defaultQuantity: Number(ticketValue(card, "defaultQuantity")),
    capacity: capacity.length === 0 ? null : Number(capacity),
    active: ticketChecked(card, "active"),
    sortOrder: Number(ticketValue(card, "sortOrder")),
  };

  if (includeKey) {
    ticket.key = ticketValue(card, "key");
  }

  return ticket;
}

export function isTicketValid(ticket: Record<string, unknown>, includeKey: boolean): boolean {
  const label = ticket.label as Record<string, string>;

  return (
    (!includeKey || String(ticket.key).length > 0) &&
    Object.keys(label).length > 0 &&
    Number.isFinite(ticket.priceMinor) &&
    Number.isFinite(ticket.minPerRegistration) &&
    Number.isFinite(ticket.defaultQuantity) &&
    Number.isFinite(ticket.sortOrder) &&
    (ticket.maxPerRegistration === null || Number.isFinite(ticket.maxPerRegistration)) &&
    (ticket.capacity === null || Number.isFinite(ticket.capacity))
  );
}

export function collectTickets(form: HTMLFormElement): {
  tickets: Record<string, unknown>[];
  valid: boolean;
} {
  const tickets = [...form.querySelectorAll<HTMLElement>("[data-ticket]")].map((card) =>
    collectTicket(card, true),
  );

  return {
    tickets,
    valid: tickets.length > 0 && tickets.every((ticket) => isTicketValid(ticket, true)),
  };
}

/** Populate an existing ticket card from a stored ticket type. */
export function populateTicketCard(
  card: Element,
  ticket: {
    key: string;
    label: Record<string, string>;
    description: Record<string, string> | null;
    priceMinor: number;
    minPerRegistration: number;
    maxPerRegistration: number | null;
    defaultQuantity: number;
    capacity: number | null;
    active: boolean;
    sortOrder: number;
  },
): void {
  const fields: [string, string | number][] = [
    ["key", ticket.key],
    ["priceMinor", ticket.priceMinor],
    ["minPerRegistration", ticket.minPerRegistration],
    ["maxPerRegistration", ticket.maxPerRegistration ?? ""],
    ["defaultQuantity", ticket.defaultQuantity],
    ["capacity", ticket.capacity ?? ""],
    ["sortOrder", ticket.sortOrder],
  ];

  for (const [field, value] of fields) {
    const element = card.querySelector<HTMLElement & { value: string }>(
      `[data-ticket-field="${field}"]`,
    );

    if (element !== null) {
      element.value = String(value);
    }
  }

  for (const element of card.querySelectorAll<HTMLElement & { value: string }>(
    "[data-ticket-label]",
  )) {
    const language = element.dataset.ticketLabel;
    element.value = language === undefined ? "" : (ticket.label[language] ?? "");
  }

  for (const element of card.querySelectorAll<HTMLElement & { value: string }>(
    "[data-ticket-description]",
  )) {
    const language = element.dataset.ticketDescription;
    element.value = language === undefined ? "" : (ticket.description?.[language] ?? "");
  }

  const active = card.querySelector<HTMLElement & { checked: boolean }>(
    '[data-ticket-field="active"]',
  );

  if (active !== null) {
    active.checked = ticket.active;
  }
}
