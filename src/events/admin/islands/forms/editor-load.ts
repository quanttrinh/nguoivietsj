import { initEngineFormBuilder } from "~/events/admin/islands/forms/builder";
import { initEngineFormEditor } from "~/events/admin/islands/forms/editor";
import { adminEventUrl } from "~/events/admin/islands/shared/routes";
import { createStarterFormSchema } from "~/events/domain/form-schema/schema/starter";
import { localized } from "~/events/domain/localized";
import { fetchJsonCached } from "~/shared/client/data-cache";
import { readJsonScript } from "~/shared/client/json-script";
import { DEFAULT_LOCALE } from "~/shared/constants/locales";

interface Messages {
  loadFailed: string;
}

interface TicketType {
  key: string;
  active: boolean;
}

interface EventPayload {
  id: string;
  title: Record<string, string>;
  ticketTypes: TicketType[];
}

interface FormVersion {
  version: number;
  schema: unknown;
}

function setText(id: string, value: string): void {
  const element = document.querySelector<HTMLElement>(`#${id}`);

  if (element !== null) {
    element.textContent = value;
  }
}

/** Initialize the static form-version editor. */
export function initFormEditorLoader(): void {
  const form = document.querySelector<HTMLFormElement>("#engine-form-editor");
  const params = new URLSearchParams(globalThis.location.search);
  const eventId = params.get("event");
  const versionParam = params.get("version");
  const messages = readJsonScript<Messages>("engine-form-editor-messages");
  const error = document.querySelector<HTMLElement>("#engine-form-load-error");
  const pageTitle = document.title;

  if (form === null || form.dataset.loaded === "true" || eventId === null) {
    return;
  }

  form.dataset.loaded = "true";

  if (messages === null) {
    return;
  }

  const fail = (message: string): void => {
    form.hidden = true;

    if (error !== null) {
      error.hidden = false;
      error.textContent = message;
    }
  };

  void (async (): Promise<void> => {
    try {
      const base = `/api/events/admin/events/${encodeURIComponent(eventId)}`;
      const payload = await fetchJsonCached<{
        event: EventPayload;
        formVersions: FormVersion[];
      }>(`${base}/form-versions`);

      const event = payload.event;
      const versions = payload.formVersions;
      let latestVersion = 0;

      for (const version of versions) {
        latestVersion = Math.max(latestVersion, version.version);
      }
      const nextVersion = latestVersion + 1;
      const requestedVersion = versionParam === null ? null : Number(versionParam);
      const source =
        requestedVersion === null
          ? null
          : (versions.find((version) => version.version === requestedVersion) ?? null);

      if (requestedVersion !== null && source === null) {
        fail(messages.loadFailed);
        return;
      }

      const schema =
        source?.schema ??
        createStarterFormSchema(
          event.ticketTypes.filter((ticket) => ticket.active).map((ticket) => ticket.key),
        );
      const textarea = form.querySelector<HTMLTextAreaElement & { value: string }>(
        "#engine-form-schema",
      );
      const locale = form.dataset.locale ?? DEFAULT_LOCALE;
      const detailUrl = adminEventUrl(locale, { eventId: event.id });
      const back = document.querySelector<HTMLAnchorElement>("#engine-form-back");
      const cancel = document.querySelector<HTMLElement>("#engine-form-cancel");
      const noTickets = document.querySelector<HTMLElement>("#engine-form-no-tickets");

      form.dataset.eventId = event.id;
      form.dataset.nextVersion = String(nextVersion);

      if (textarea !== null) {
        textarea.value = JSON.stringify(schema, null, 2);
      }

      setText("engine-form-source-version", source === null ? "—" : String(source.version));
      setText("engine-form-next-version", String(nextVersion));
      setText(
        "engine-form-active-tickets",
        String(event.ticketTypes.filter((ticket) => ticket.active).length),
      );
      setText("engine-form-title", localized(event.title, locale, ""));

      if (back !== null) {
        back.href = detailUrl;
      }

      if (cancel !== null) {
        cancel.setAttribute("href", detailUrl);
      }

      if (noTickets !== null) {
        noTickets.hidden = event.ticketTypes.some((ticket) => ticket.active);
      }

      document.title = `${pageTitle}: ${localized(event.title, locale, "")}`;
      initEngineFormBuilder();
      initEngineFormEditor();
    } catch (error_) {
      console.error(error_);
      fail(messages.loadFailed);
    }
  })();
}
