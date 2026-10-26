import { adminEventUrl } from "~/events/admin/islands/shared/routes";
import { FORM_VERSION_STATUS } from "~/events/domain/constants";
import { clearNotice, showNotice } from "~/shared/client/feedback";
import { readControlValue } from "~/shared/client/form-controls";
import { readJsonScript } from "~/shared/client/json-script";
import { DEFAULT_LOCALE } from "~/shared/constants/locales";

interface FormEditorMessages {
  formatFailed: string;
  formValidationFailed: string;
  saveFailed: string;
  saving: string;
  formSavedDraft: string;
  formSavedPublished: string;
}

interface FormIssue {
  path: string;
  message: string;
}

interface FormEditorResponse {
  error?: string;
  issues?: FormIssue[];
  formVersion?: { version?: number };
}

function submitterHost(event: SubmitEvent): HTMLElement | null {
  const submitter = event.submitter;

  if (!(submitter instanceof HTMLElement)) {
    return null;
  }

  const root = submitter.getRootNode();

  return root instanceof ShadowRoot && root.host instanceof HTMLElement ? root.host : submitter;
}

function showMessage(notice: HTMLElement | null, message: string, tone: "success" | "error"): void {
  showNotice(notice, message, tone);
}

function showIssues(
  notice: HTMLElement | null,
  message: string,
  issues: readonly FormIssue[],
): void {
  if (!notice) {
    return;
  }

  const heading = document.createElement("strong");
  heading.textContent = message;
  const list = document.createElement("ul");

  for (const issue of issues) {
    const item = document.createElement("li");
    item.textContent = `${issue.path}: ${issue.message}`;
    list.append(item);
  }

  notice.dataset.tone = "error";
  notice.replaceChildren(heading, list);
  notice.hidden = false;
  notice.focus();
}

function parseSchema(textarea: HTMLQuiTextareaElement): unknown {
  try {
    return JSON.parse(readControlValue(textarea)) as unknown;
  } catch {
    return null;
  }
}

/** Initialize the create/edit form-version editor. */
export function initEngineFormEditor(): void {
  const form = document.querySelector<HTMLFormElement>("#engine-form-editor");

  if (form === null || form.dataset.ready === "true") {
    return;
  }

  form.dataset.ready = "true";

  const messages = readJsonScript<FormEditorMessages>("engine-form-editor-messages");
  const textarea = form.querySelector<HTMLQuiTextareaElement>("#engine-form-schema");

  if (messages === null || textarea === null) {
    return;
  }

  const locale = form.dataset.locale ?? DEFAULT_LOCALE;
  const eventId = form.dataset.eventId ?? "";
  const nextVersion = Number(form.dataset.nextVersion);
  const notice = document.querySelector<HTMLElement>("#engine-form-editor-notice");
  const formatButton = form.querySelector<HTMLQuiButtonElement>("#engine-form-format");
  const submitButtons = form.querySelectorAll<HTMLQuiButtonElement>("[data-form-status]");
  const labels = new Map<HTMLQuiButtonElement, string>();

  for (const button of submitButtons) {
    labels.set(button, button.textContent ?? "");
  }

  formatButton?.addEventListener("click", () => {
    const parsed = parseSchema(textarea);

    if (parsed === null) {
      showMessage(notice, messages.formatFailed, "error");
      return;
    }

    textarea.value = JSON.stringify(parsed, null, 2);
    clearNotice(notice);
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearNotice(notice);

    const submitter = submitterHost(event);
    const status =
      submitter?.dataset.formStatus === FORM_VERSION_STATUS.published
        ? FORM_VERSION_STATUS.published
        : FORM_VERSION_STATUS.draft;
    const schema = parseSchema(textarea);

    if (schema === null) {
      showMessage(notice, messages.formatFailed, "error");
      return;
    }

    if (!Number.isInteger(nextVersion) || nextVersion < 1) {
      showMessage(notice, messages.saveFailed, "error");
      return;
    }

    for (const button of submitButtons) {
      button.disabled = true;
    }

    if (submitter !== null) {
      submitter.textContent = messages.saving;
    }

    void (async (): Promise<void> => {
      try {
        const response = await fetch(`/api/events/admin/events/${eventId}/form-versions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ version: nextVersion, schema, status }),
        });
        const body = (await response.json()) as FormEditorResponse;

        if (!response.ok) {
          const issues = body.issues ?? [];

          if (body.error === "invalid_form_schema" && issues.length > 0) {
            showIssues(notice, messages.formValidationFailed, issues);
          } else {
            showMessage(
              notice,
              status === FORM_VERSION_STATUS.published
                ? messages.formValidationFailed
                : messages.saveFailed,
              "error",
            );
          }
          return;
        }

        const version = body.formVersion?.version ?? nextVersion;
        showMessage(
          notice,
          status === FORM_VERSION_STATUS.published
            ? messages.formSavedPublished
            : messages.formSavedDraft,
          "success",
        );
        const versionParams = new URLSearchParams({ version: String(version) });
        globalThis.location.assign(
          adminEventUrl(locale, { view: "preview", eventId, params: versionParams }),
        );
      } catch (error) {
        console.error(error);
        showMessage(notice, messages.saveFailed, "error");
      } finally {
        for (const button of submitButtons) {
          button.disabled = false;
          button.textContent = labels.get(button) ?? "";
        }
      }
    })();
  });
}
