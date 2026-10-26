import { populateTicketCard } from "~/events/admin/islands/forms/ticket-fields";
import { adminEventUrl } from "~/events/admin/islands/shared/routes";
import { localized } from "~/events/domain/localized";
import type { EventDetail, EventNoteBlock, TicketTypeRecord } from "~/events/domain/types";
import { readJsonScript } from "~/shared/client/json-script";
import { DEFAULT_LOCALE } from "~/shared/constants/locales";
import { toLocalDateTime } from "~/shared/utils/datetime";

interface EventFormMessages {
  loadFailed: string;
}

function control(form: HTMLFormElement, name: string): HTMLElement | null {
  return form.querySelector<HTMLElement>(`[name="${name}"]`);
}

function setValue(form: HTMLFormElement, name: string, value: string): void {
  const element = control(form, name);

  if (element === null) {
    return;
  }

  if (element.localName === "qui-select") {
    (element as HTMLElement & { value: string[] }).value = [value];
    return;
  }

  (element as HTMLElement & { value: string }).value = value;
}

function setChecked(form: HTMLFormElement, name: string, checked: boolean): void {
  const element = control(form, name);

  if (element === null) {
    return;
  }

  (element as HTMLElement & { checked: boolean }).checked = checked;
}

function setLocalized(
  form: HTMLFormElement,
  attribute: string,
  values: Record<string, string>,
): void {
  for (const element of form.querySelectorAll<HTMLElement>(`[${attribute}]`)) {
    const language = element.getAttribute(attribute);

    if (language !== null) {
      (element as HTMLElement & { value: string }).value = values[language] ?? "";
    }
  }
}

function noteField(card: HTMLElement, name: string): HTMLElement & { value: string } {
  const element = card.querySelector<HTMLElement & { value: string }>(
    `[data-note-field="${name}"]`,
  );

  if (element === null) {
    throw new Error(`Missing note field "${name}"`);
  }

  return element;
}

function populateNote(card: HTMLElement, block: EventNoteBlock): void {
  if (block.type === "paragraph") {
    noteField(card, "paragraph").value = block.text;
    return;
  }

  if (block.type === "bullets") {
    noteField(card, "bullets").value = block.items.join("\n");
    return;
  }

  noteField(card, "label").value = block.label;
  noteField(card, "href").value = block.href;
}

function populateNoteEditor(
  form: HTMLFormElement,
  editor: HTMLElement,
  notes: Record<string, EventNoteBlock[]>,
): void {
  const language = editor.dataset.noteLocale;
  const blocks = editor.querySelector<HTMLElement>("[data-note-blocks]");

  if (language === undefined || blocks === null) {
    return;
  }

  blocks.replaceChildren();

  for (const block of notes[language] ?? []) {
    const template = form.querySelector<HTMLTemplateElement>(`#note-template-${block.type}`);

    if (template !== null) {
      blocks.append(template.content.cloneNode(true));
      const card = blocks.lastElementChild;

      if (card instanceof HTMLElement) {
        populateNote(card, block);
      }
    }
  }
}

function populateNotes(form: HTMLFormElement, notes: Record<string, EventNoteBlock[]>): void {
  for (const editor of form.querySelectorAll<HTMLElement>("[data-note-editor]")) {
    populateNoteEditor(form, editor, notes);
  }
}

function populateTickets(form: HTMLFormElement, tickets: TicketTypeRecord[]): void {
  const list = form.querySelector<HTMLElement>("#ticket-types");
  const template = form.querySelector<HTMLTemplateElement>("#ticket-type-template");

  if (list === null || template === null) {
    return;
  }

  list.replaceChildren();

  for (const ticket of tickets) {
    list.append(template.content.cloneNode(true));
    const card = list.lastElementChild;

    if (card instanceof HTMLElement) {
      populateTicketCard(card, ticket);
    }
  }
}

function populateEvent(form: HTMLFormElement, event: EventDetail, mode: "edit" | "clone"): void {
  const clone = mode === "clone";
  const defaultLocale = event.defaultLocale;

  form.dataset.defaultLocale = defaultLocale;

  if (mode === "edit") {
    form.dataset.eventId = event.id;
  }

  setValue(form, "status", clone ? "draft" : event.status);
  setValue(form, "defaultLocale", defaultLocale);
  setValue(form, "aliases", clone ? "" : event.aliases.join("\n"));
  setValue(form, "timezone", event.timezone);
  setChecked(form, "enabled", clone ? false : event.enabled);
  setChecked(form, "registrationOpen", clone ? false : event.registrationOpen);
  setLocalized(form, "data-locale-title", event.title);
  setLocalized(form, "data-locale-summary", event.summary);
  setValue(form, "startsAt", toLocalDateTime(event.startsAt));
  setValue(form, "endsAt", toLocalDateTime(event.endsAt));
  setValue(form, "locationName", event.location.name);
  setValue(form, "locationAddress", event.location.address);
  setValue(form, "locationMapUrl", event.location.mapUrl ?? "");
  setValue(form, "locationMapEmbedUrl", event.location.mapEmbedUrl ?? "");
  setValue(form, "currency", event.limits.currency);
  setValue(
    form,
    "maxTicketsPerRegistration",
    event.limits.maxTicketsPerRegistration === null
      ? ""
      : String(event.limits.maxTicketsPerRegistration),
  );
  setValue(
    form,
    "maxTotalTickets",
    event.limits.maxTotalTickets === null ? "" : String(event.limits.maxTotalTickets),
  );
  setChecked(form, "etransferEnabled", event.payments.etransfer.enabled);
  setValue(form, "etransferEmail", event.payments.etransfer.email ?? "");
  setChecked(form, "cashEnabled", event.payments.cash.enabled);
  setValue(form, "cashAddress", event.payments.cash.address ?? "");
  setValue(form, "cashMapUrl", event.payments.cash.mapUrl ?? "");
  setValue(form, "cashMapEmbedUrl", event.payments.cash.mapEmbedUrl ?? "");
  populateNotes(form, event.notes);

  if (clone) {
    setValue(form, "slug", `${event.slug}-copy`);
    setValue(form, "eventType", event.eventType);
    setValue(form, "editionYear", String(event.editionYear + 1));
    populateTickets(form, event.ticketTypes);
  } else {
    const slug = form.querySelector<HTMLElement>("#engine-event-slug");
    const type = form.querySelector<HTMLElement>("#engine-event-type");
    const year = form.querySelector<HTMLElement>("#engine-event-year");

    if (slug !== null) {
      slug.textContent = event.slug;
    }
    if (type !== null) {
      type.textContent = event.eventType;
    }
    if (year !== null) {
      year.textContent = String(event.editionYear);
    }
  }

  const back = document.querySelector<HTMLAnchorElement>("#engine-event-back");
  const cancel = document.querySelector<HTMLElement>("#engine-event-cancel");
  const headerTitle = document.querySelector<HTMLElement>("#engine-clone-title");
  const detailUrl = adminEventUrl(form.dataset.locale ?? DEFAULT_LOCALE, { eventId: event.id });

  if (headerTitle !== null) {
    const locale = form.dataset.locale ?? DEFAULT_LOCALE;
    headerTitle.textContent = localized(event.title, locale, event.slug);
  }

  if (back !== null) {
    back.href = detailUrl;
  }

  if (cancel !== null) {
    cancel.setAttribute("href", clone ? `/${form.dataset.locale}/events/admin` : detailUrl);
  }
}

async function loadEvent(eventId: string): Promise<EventDetail> {
  const response = await fetch(`/api/events/admin/events/${encodeURIComponent(eventId)}`, {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(String(response.status));
  }

  const payload = (await response.json()) as { event?: EventDetail };

  if (payload.event === undefined) {
    throw new Error("event_not_found");
  }

  return payload.event;
}

/** Populate a static event create/edit form from the selected event. */
export function initEventFormLoader(): void {
  const form = document.querySelector<HTMLFormElement>("#engine-event-form");
  const eventId = new URLSearchParams(globalThis.location.search).get("event");
  const mode = form?.dataset.mode;

  if (
    form === null ||
    form.dataset.loaded === "true" ||
    eventId === null ||
    (mode !== "edit" && mode !== "clone")
  ) {
    return;
  }

  form.dataset.loaded = "true";
  const messages = readJsonScript<EventFormMessages>("engine-event-messages");

  void (async (): Promise<void> => {
    try {
      const event = await loadEvent(eventId);
      populateEvent(form, event, mode);
    } catch (error) {
      console.error(error);
      const notice = document.querySelector<HTMLElement>("#engine-event-notice");

      if (notice !== null && messages !== null) {
        notice.hidden = false;
        notice.dataset.tone = "error";
        notice.textContent = messages.loadFailed;
      }
    }
  })();
}
