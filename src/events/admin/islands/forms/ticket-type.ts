import { collectTicket, isTicketValid } from "~/events/admin/islands/forms/ticket-fields";
import { adminEventUrl } from "~/events/admin/islands/shared/routes";
import { showNotice } from "~/shared/client/feedback";
import { readJsonScript } from "~/shared/client/json-script";
import { API_ERROR } from "~/shared/constants/api-errors";
import { DEFAULT_LOCALE } from "~/shared/constants/locales";

interface TicketTypeMessages {
  saving: string;
  saveFailed: string;
  invalidPayload: string;
  ticketTypeExists: string;
  archiveConfirm: string;
  archiveFailed: string;
}

interface TicketTypeResponse {
  error?: string;
  fields?: string[];
}

function errorMessage(
  messages: TicketTypeMessages,
  status: number,
  body: TicketTypeResponse,
): string {
  if (body.error === API_ERROR.ticketTypeExists) {
    return messages.ticketTypeExists;
  }

  if (status === 400) {
    return messages.invalidPayload;
  }

  return messages.saveFailed;
}

/** Initialize the create/edit ticket-type form. */
export function initEngineTicketTypeForm(): void {
  const form = document.querySelector<HTMLFormElement>("#engine-ticket-type-form");

  if (form === null || form.dataset.ready === "true") {
    return;
  }

  form.dataset.ready = "true";

  const messages = readJsonScript<TicketTypeMessages>("engine-ticket-type-messages");
  const card = form.querySelector<HTMLElement>("[data-ticket]");

  if (messages === null || card === null) {
    return;
  }

  const locale = form.dataset.locale ?? DEFAULT_LOCALE;
  const eventId = form.dataset.eventId ?? "";
  const ticketKey = form.dataset.ticketKey ?? "";
  const mode = form.dataset.mode === "edit" ? "edit" : "create";
  const notice = document.querySelector<HTMLElement>("#engine-ticket-type-notice");
  const submit = form.querySelector<HTMLQuiButtonElement>("#engine-ticket-type-submit");
  const archive = form.querySelector<HTMLQuiButtonElement>("#engine-ticket-type-archive");
  const submitText = submit?.textContent ?? "";
  const endpoint =
    mode === "create"
      ? `/api/events/admin/events/${eventId}/ticket-types`
      : `/api/events/admin/events/${eventId}/ticket-types/${encodeURIComponent(ticketKey)}`;
  const detailUrl = adminEventUrl(locale, { eventId });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (notice) {
      notice.hidden = true;
    }

    if (!form.reportValidity()) {
      return;
    }

    const ticket = collectTicket(card, mode === "create");

    if (!isTicketValid(ticket, mode === "create")) {
      showNotice(notice, messages.invalidPayload, "error");
      return;
    }

    if (submit !== null) {
      submit.disabled = true;
      submit.textContent = messages.saving;
    }

    void (async (): Promise<void> => {
      try {
        const response = await fetch(endpoint, {
          method: mode === "create" ? "POST" : "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(ticket),
        });
        const body = (await response.json()) as TicketTypeResponse;

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

        globalThis.location.assign(detailUrl);
      } catch (error) {
        console.error(error);
        showNotice(notice, messages.saveFailed, "error");
      } finally {
        if (submit !== null) {
          submit.disabled = false;
          submit.textContent = submitText;
        }
      }
    })();
  });

  archive?.addEventListener("click", () => {
    // oxlint-disable-next-line eslint/no-alert -- Native confirmation is sufficient for this admin-only destructive action.
    if (!globalThis.confirm(messages.archiveConfirm)) {
      return;
    }

    archive.disabled = true;

    void (async (): Promise<void> => {
      try {
        const response = await fetch(endpoint, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ active: false }),
        });

        if (!response.ok) {
          showNotice(notice, messages.archiveFailed, "error");
          return;
        }

        globalThis.location.assign(detailUrl);
      } catch (error) {
        console.error(error);
        showNotice(notice, messages.archiveFailed, "error");
      } finally {
        archive.disabled = false;
      }
    })();
  });
}
