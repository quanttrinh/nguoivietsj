import { collectTickets, datasetKey } from "~/events/admin/islands/forms/ticket-fields";
import { adminEventUrl } from "~/events/admin/islands/shared/routes";
import { DEFAULT_TIMEZONE } from "~/events/domain/constants";
import { showNotice } from "~/shared/client/feedback";
import { readControlValue, readFormChecked, readFormValue } from "~/shared/client/form-controls";
import { readJsonScript } from "~/shared/client/json-script";
import { API_ERROR } from "~/shared/constants/api-errors";
import { DEFAULT_LOCALE } from "~/shared/constants/locales";
import { toIsoDateTime, toLocalDateTime } from "~/shared/utils/datetime";

interface EventFormMessages {
  saving: string;
  saved: string;
  saveFailed: string;
  invalidPayload: string;
  eventExists: string;
  loadFailed: string;
}

interface ApiError {
  error?: string;
  fields?: string[];
}

const TIMEZONE_DEFAULT = DEFAULT_TIMEZONE;

function localizedValues(form: HTMLFormElement, attribute: string): Record<string, string> {
  const values: Record<string, string> = {};
  const key = datasetKey(attribute);

  for (const field of form.querySelectorAll<HTMLElement>(`[${attribute}]`)) {
    const language = field.dataset[key];
    const value = readControlValue(field).trim();

    if (language !== undefined && value.length > 0) {
      values[language] = value;
    }
  }

  return values;
}

function inputValue(form: HTMLFormElement, name: string): string {
  return readFormValue(form, name).trim();
}

function checked(form: HTMLFormElement, name: string): boolean {
  return readFormChecked(form, name);
}

function nullableText(value: string): string | null {
  return value.length > 0 ? value : null;
}

function nullableInteger(value: string): number | null {
  if (value.length === 0) {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function errorMessage(messages: EventFormMessages, status: number, body: ApiError): string {
  if (body.error === API_ERROR.eventExists) {
    return messages.eventExists;
  }

  if (status === 400) {
    return messages.invalidPayload;
  }

  return messages.saveFailed;
}

function initializeTicketActions(form: HTMLFormElement): void {
  const list = form.querySelector<HTMLElement>("#ticket-types");
  const template = form.querySelector<HTMLTemplateElement>("#ticket-type-template");
  const add = form.querySelector<HTMLQuiButtonElement>("#add-ticket-type");

  if (!list || !template) {
    return;
  }

  add?.addEventListener("click", () => {
    list.append(template.content.cloneNode(true));
  });

  list.addEventListener("click", (event) => {
    const target = event.target;

    if (!(target instanceof HTMLElement) || !target.matches("[data-remove-ticket]")) {
      return;
    }

    const card = target.closest("[data-ticket]");
    const cards = list.querySelectorAll("[data-ticket]");

    if (card instanceof HTMLElement && cards.length > 1) {
      card.remove();
    }
  });
}

function noteField(card: Element, name: string): string {
  return readControlValue(card.querySelector(`[data-note-field="${name}"]`)).trim();
}

function collectNotes(form: HTMLFormElement): Record<string, unknown[]> {
  const notes: Record<string, unknown[]> = {};

  for (const editor of form.querySelectorAll<HTMLElement>("[data-note-editor]")) {
    const language = editor.dataset.noteLocale;
    const blocks: unknown[] = [];

    for (const card of editor.querySelectorAll<HTMLElement>("[data-note-block]")) {
      const type = card.dataset.noteType;

      if (type === "paragraph") {
        const text = noteField(card, "paragraph");

        if (text.length > 0) {
          blocks.push({ type, text });
        }
      } else if (type === "bullets") {
        const items = noteField(card, "bullets")
          .split("\n")
          .map((item) => item.trim())
          .filter((item) => item.length > 0);

        if (items.length > 0) {
          blocks.push({ type, items });
        }
      } else if (type === "link") {
        const label = noteField(card, "label");
        const href = noteField(card, "href");

        if (label.length > 0 && href.length > 0) {
          blocks.push({ type, label, href });
        }
      }
    }

    if (language !== undefined && blocks.length > 0) {
      notes[language] = blocks;
    }
  }

  return notes;
}

function initializeNoteEditors(form: HTMLFormElement): void {
  form.addEventListener("click", (event) => {
    const target = event.target;

    if (!(target instanceof HTMLElement)) {
      return;
    }

    const add = target.closest<HTMLElement>("[data-add-note-block]");

    if (add !== null) {
      const editor = add.closest<HTMLElement>("[data-note-editor]");
      const blocks = editor?.querySelector<HTMLElement>("[data-note-blocks]");
      const type = add.dataset.addNoteBlock;
      const template =
        type === undefined
          ? null
          : form.querySelector<HTMLTemplateElement>(`#note-template-${type}`);

      if (blocks !== null && blocks !== undefined && template !== null) {
        blocks.append(template.content.cloneNode(true));
      }

      return;
    }

    const action = target.closest<HTMLElement>("[data-note-action]");

    if (action === null) {
      return;
    }

    const card = action.closest<HTMLElement>("[data-note-block]");
    const parent = card?.parentElement;
    const nextAction = action.dataset.noteAction;

    if (card === null || card === undefined || parent === null || parent === undefined) {
      return;
    }

    if (nextAction === "remove") {
      card.remove();
      return;
    }

    if (nextAction === "up") {
      const previous = card.previousElementSibling;

      if (previous !== null) {
        previous.before(card);
      }

      return;
    }

    if (nextAction === "down") {
      const next = card.nextElementSibling;

      if (next !== null) {
        card.before(next);
      }
    }
  });
}

function initializeDateFields(form: HTMLFormElement): void {
  for (const field of form.querySelectorAll<HTMLElement & { value?: string }>("[data-iso-value]")) {
    const iso = field.dataset.isoValue ?? "";

    if (iso.length > 0) {
      field.value = toLocalDateTime(iso);
    }
  }
}

function verifyLocalizedTitle(form: HTMLFormElement): boolean {
  const defaultTitle = form.querySelector<HTMLElement>(
    `[data-locale-title="${form.dataset.defaultLocale ?? DEFAULT_LOCALE}"]`,
  );
  return defaultTitle === null || readControlValue(defaultTitle).trim().length > 0;
}

function aliasValues(value: string): string[] {
  return value
    .split(/[\n,]+/u)
    .map((alias) => alias.trim().toLowerCase())
    .filter((alias) => alias.length > 0);
}

/** Initialize the event create or edit form. */
export function initEngineEventForm(): void {
  const form = document.querySelector<HTMLFormElement>("#engine-event-form");

  if (form === null || form.dataset.ready === "true") {
    return;
  }

  form.dataset.ready = "true";

  const messages = readJsonScript<EventFormMessages>("engine-event-messages");

  if (messages === null) {
    return;
  }

  const locale = form.dataset.locale ?? DEFAULT_LOCALE;
  const notice = document.querySelector<HTMLElement>("#engine-event-notice");
  const button = form.querySelector<HTMLQuiButtonElement>("#engine-event-submit");
  const buttonText = button?.textContent ?? "";

  initializeDateFields(form);
  initializeTicketActions(form);
  initializeNoteEditors(form);

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    let mode: "create" | "edit" | "clone" = "create";

    if (form.dataset.mode === "edit") {
      mode = "edit";
    } else if (form.dataset.mode === "clone") {
      mode = "clone";
    }

    const eventId = form.dataset.eventId ?? "";

    if (notice) {
      notice.hidden = true;
    }

    if (!form.reportValidity()) {
      return;
    }

    if (!verifyLocalizedTitle(form)) {
      showNotice(notice, messages.invalidPayload, "error");
      return;
    }

    const title = localizedValues(form, "data-locale-title");
    const summary = localizedValues(form, "data-locale-summary");
    const startsAt = toIsoDateTime(inputValue(form, "startsAt"));
    const endsAt = toIsoDateTime(inputValue(form, "endsAt"));

    if (
      Object.keys(title).length === 0 ||
      (inputValue(form, "startsAt").length > 0 && startsAt === null) ||
      (inputValue(form, "endsAt").length > 0 && endsAt === null)
    ) {
      showNotice(notice, messages.invalidPayload, "error");
      return;
    }

    const limits = {
      currency: inputValue(form, "currency").toUpperCase(),
      maxTicketsPerRegistration: nullableInteger(inputValue(form, "maxTicketsPerRegistration")),
      maxTotalTickets: nullableInteger(inputValue(form, "maxTotalTickets")),
    };

    const ticketResult = mode === "edit" ? null : collectTickets(form);

    if (ticketResult !== null && !ticketResult.valid) {
      showNotice(notice, messages.invalidPayload, "error");
      return;
    }

    const payload: Record<string, unknown> = {
      defaultLocale: inputValue(form, "defaultLocale"),
      aliases: aliasValues(inputValue(form, "aliases")),
      title,
      summary,
      startsAt,
      endsAt,
      timezone: inputValue(form, "timezone") || TIMEZONE_DEFAULT,
      status: inputValue(form, "status"),
      enabled: checked(form, "enabled"),
      registrationOpen: checked(form, "registrationOpen"),
      limits,
      location: {
        name: inputValue(form, "locationName"),
        address: inputValue(form, "locationAddress"),
        mapUrl: nullableText(inputValue(form, "locationMapUrl")),
        mapEmbedUrl: nullableText(inputValue(form, "locationMapEmbedUrl")),
      },
      payments: {
        etransfer: {
          enabled: checked(form, "etransferEnabled"),
          email: nullableText(inputValue(form, "etransferEmail")),
        },
        cash: {
          enabled: checked(form, "cashEnabled"),
          address: nullableText(inputValue(form, "cashAddress")),
          mapUrl: nullableText(inputValue(form, "cashMapUrl")),
          mapEmbedUrl: nullableText(inputValue(form, "cashMapEmbedUrl")),
        },
      },
      notes: collectNotes(form),
    };

    if (mode !== "edit") {
      payload.slug = inputValue(form, "slug");
      payload.eventType = inputValue(form, "eventType");
      payload.editionYear = Number(inputValue(form, "editionYear"));
      payload.ticketTypes = ticketResult?.tickets ?? [];
    }

    if (button) {
      button.disabled = true;
      button.textContent = messages.saving;
    }

    void (async (): Promise<void> => {
      try {
        const endpoint =
          mode === "edit" ? `/api/events/admin/events/${eventId}` : `/api/events/admin/events`;
        const response = await fetch(endpoint, {
          method: mode === "edit" ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const body = (await response.json()) as ApiError & {
          event?: { id?: string };
        };

        if (!response.ok) {
          const fields = body.fields ?? [];
          const fieldSuffix = fields.length > 0 ? ` (${fields.join(", ")})` : "";
          showNotice(
            notice,
            `${errorMessage(messages, response.status, body)}${fieldSuffix}`,
            "error",
          );
          return;
        }

        if (mode !== "edit" && body.event?.id) {
          globalThis.location.assign(adminEventUrl(locale, { eventId: body.event.id }));
          return;
        }

        showNotice(notice, messages.saved, "success");
      } catch (error) {
        console.error(error);
        showNotice(notice, messages.saveFailed, "error");
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = buttonText;
        }
      }
    })();
  });
}
