import { populateTicketCard } from "~/events/admin/islands/forms/ticket-fields";
import { adminEventUrl } from "~/events/admin/islands/shared/routes";
import type { EventDetail, TicketTypeRecord } from "~/events/domain/types";
import { showNotice } from "~/shared/client/feedback";
import { readJsonScript } from "~/shared/client/json-script";
import { DEFAULT_LOCALE } from "~/shared/constants/locales";

interface Messages {
  loadFailed: string;
}

function card(form: HTMLFormElement): HTMLElement | null {
  return form.querySelector<HTMLElement>("[data-ticket]");
}

function loadFailed(form: HTMLFormElement, messages: Messages): void {
  const notice = document.querySelector<HTMLElement>("#engine-ticket-type-notice");
  showNotice(notice, messages.loadFailed, "error");
  form.dataset.ready = "true";
}

/** Populate the static ticket-type create/edit form. */
export function initTicketTypeLoader(): void {
  const form = document.querySelector<HTMLFormElement>("#engine-ticket-type-form");
  const params = new URLSearchParams(globalThis.location.search);
  const eventId = params.get("event");
  const key = params.get("key");
  const mode = form?.dataset.mode;

  if (form === null || form.dataset.loaded === "true" || eventId === null) {
    return;
  }

  form.dataset.loaded = "true";
  form.dataset.eventId = eventId;

  const locale = form.dataset.locale ?? DEFAULT_LOCALE;
  const detailUrl = adminEventUrl(locale, { eventId });
  const back = document.querySelector<HTMLAnchorElement>("#engine-ticket-type-back");
  const cancel = document.querySelector<HTMLElement>("#engine-ticket-type-cancel");

  if (back !== null) {
    back.href = detailUrl;
  }

  if (cancel !== null) {
    cancel.setAttribute("href", detailUrl);
  }

  if (mode !== "edit") {
    return;
  }

  if (key === null) {
    const messages = readJsonScript<Messages>("engine-ticket-type-messages");

    if (messages !== null) {
      loadFailed(form, messages);
    }
    return;
  }

  form.dataset.ticketKey = key;

  void (async (): Promise<void> => {
    try {
      const response = await fetch(`/api/events/admin/events/${encodeURIComponent(eventId)}`, {
        headers: { accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(String(response.status));
      }

      const payload = (await response.json()) as { event?: EventDetail };
      const ticket: TicketTypeRecord | undefined = payload.event?.ticketTypes.find(
        (entry) => entry.key === key,
      );
      const messages = readJsonScript<Messages>("engine-ticket-type-messages");
      const target = card(form);

      if (payload.event === undefined || ticket === undefined || target === null) {
        if (messages !== null) {
          loadFailed(form, messages);
        }
        return;
      }

      populateTicketCard(target, ticket);
      const archive = document.querySelector<HTMLElement>("#engine-ticket-type-archive");

      if (archive !== null) {
        archive.hidden = !ticket.active;
      }
    } catch (error) {
      console.error(error);
      const messages = readJsonScript<Messages>("engine-ticket-type-messages");

      if (messages !== null) {
        loadFailed(form, messages);
      }
    }
  })();
}
