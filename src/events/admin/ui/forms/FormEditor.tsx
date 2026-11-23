// @boundary client
/* oxlint-disable eslint/max-lines-per-function, typescript/prefer-nullish-coalescing, unicorn/max-nested-calls -- The editor keeps loading, schema, save, and JSON editing state in one component. */
import { navigate } from "astro:transitions/client";
import type { DeclaredLocales } from "intlayer";
import type { JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

import { adminQueries, adminRefresh } from "~/events/admin/ui/shared/queries";
import { adminCatalogUrl, adminEventUrl } from "~/events/admin/ui/shared/routes";
import { adminStyles as styles } from "~/events/admin/ui/shared/styles/admin-styles";
import { FORM_VERSION_STATUS } from "~/events/domain/constants";
import { MAX_FORM_SCHEMA_BYTES } from "~/events/domain/form-schema/limits";
import { createStarterFormSchema } from "~/events/domain/form-schema/schema/starter";
import { localized } from "~/events/domain/localized";
import { apiClient, apiErrorMessage, apiResponseMessage } from "~/shared/client/api/client";
import { clientLogger } from "~/shared/client/logger";
import { useQuery } from "~/shared/client/query/use-query";
import { isRecord } from "~/shared/utils/records";

import type { FormEditorLabels } from "./form-labels";

interface FormEditorProps {
  locale: DeclaredLocales;
  labels: FormEditorLabels;
}

const createFormVersion = apiClient.api.admin.events[":eventId"]["form-versions"].$post;

type JsonRecord = Record<string, unknown>;

const FORM_SCHEMA_EXAMPLE = `{
  "version": 4,
  "contacts": {
    "email": { "required": true, "width": "full", "label": { "en": "Email", "fr": "Courriel", "vi": "Email" } },
    "phone": { "required": false, "width": "full", "label": { "en": "Phone", "fr": "Téléphone", "vi": "Số điện thoại" } },
    "mail": { "required": false, "width": "full", "label": { "en": "Mailing address", "fr": "Adresse postale", "vi": "Địa chỉ thư" } },
    "confirmation": { "mode": "optional", "methods": ["email"] }
  },
  "sections": [
    { "key": "registration", "order": 10, "label": { "en": "Registration", "fr": "Inscription", "vi": "Đăng ký" } }
  ],
  "fields": [
    { "ref": "system.fullName", "section": "registration", "order": 10, "width": "full" },
    { "ref": "system.contacts.email", "section": "registration", "order": 20, "width": "full" },
    { "ref": "custom.diet", "section": "registration", "order": 30, "width": "half" },
    { "ref": "system.consent", "section": "registration", "order": 40, "width": "full" }
  ],
  "customFields": [
    {
      "key": "diet",
      "type": "select",
      "label": { "en": "Diet", "fr": "Régime", "vi": "Chế độ ăn" },
      "options": [
        { "value": "none", "label": { "en": "No restrictions", "fr": "Aucune restriction", "vi": "Không hạn chế" } },
        { "value": "vegetarian", "label": { "en": "Vegetarian", "fr": "Végétarien", "vi": "Ăn chay" } }
      ]
    }
  ],
  "overrides": {
    "fullName": { "label": { "en": "Full name", "fr": "Nom complet", "vi": "Họ và tên" } }
  }
}`;

interface FormIssue {
  path: string;
  message: string;
}

interface Notice {
  message: string;
  tone: "success" | "error";
  issues?: FormIssue[];
}

function formIssues(value: unknown): FormIssue[] {
  return Array.isArray(value)
    ? value.filter(
        (issue): issue is FormIssue =>
          isRecord(issue) && typeof issue.path === "string" && typeof issue.message === "string",
      )
    : [];
}

function parseSchema(text: string): JsonRecord | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function FormEditor({ locale, labels }: FormEditorProps): JSX.Element | null {
  const [query, setQuery] = useState<{ eventId: string | null; version: string | null }>({
    eventId: null,
    version: null,
  });
  const [queryReady, setQueryReady] = useState(false);
  const [schemaText, setSchemaText] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState<"draft" | "published" | null>(null);
  const [nextVersion, setNextVersion] = useState(1);
  const [sourceVersion, setSourceVersion] = useState<number | null>(null);
  const noticeRef = useRef<HTMLDivElement | null>(null);
  const baseTitleRef = useRef<string | null>(null);

  useEffect(() => {
    baseTitleRef.current = document.title;
    const params = new URLSearchParams(globalThis.location.search);
    setQuery({ eventId: params.get("event"), version: params.get("version") });
    setQueryReady(true);
  }, []);

  const eventId = query.eventId;
  const { data, error, loading } = useQuery(
    eventId === null ? null : adminQueries.formVersions(eventId),
  );
  const payload = data ?? null;

  useEffect(() => {
    if (payload === null) {
      return;
    }

    let latestVersion = 0;

    for (const version of payload.formVersions) {
      latestVersion = Math.max(latestVersion, version.version);
    }

    const requestedVersion = query.version === null ? null : Number(query.version);
    const source =
      requestedVersion === null
        ? null
        : (payload.formVersions.find((version) => version.version === requestedVersion) ?? null);

    if (requestedVersion !== null && source === null) {
      setLoadFailed(true);
      setNotice({ message: labels.loadFailed, tone: "error" });
      return;
    }

    setLoadFailed(false);

    const schema =
      source?.schema ??
      createStarterFormSchema(
        payload.event.ticketTypes.filter((ticket) => ticket.active).map((ticket) => ticket.key),
      );

    setNextVersion(latestVersion + 1);
    setSourceVersion(source?.version ?? null);
    setSchemaText(JSON.stringify(schema, null, 2));

    const baseTitle = baseTitleRef.current ?? document.title;
    document.title = `${baseTitle}: ${localized(payload.event.title, locale, "")}`;
  }, [payload, query.version, locale, labels.loadFailed]);

  useEffect(() => {
    if (notice !== null) {
      noticeRef.current?.focus();
    }
  }, [notice]);

  const activeTickets = payload?.event.ticketTypes.filter((ticket) => ticket.active).length ?? 0;
  const detailUrl =
    query.eventId === null
      ? adminCatalogUrl(locale)
      : adminEventUrl(locale, { eventId: query.eventId });

  if (!queryReady) {
    return null;
  }

  if (query.eventId === null) {
    return (
      <p class={styles.notice} data-tone="error" role="alert">
        {labels.loadFailed}
      </p>
    );
  }

  if (loading) {
    return null;
  }

  if (error !== null || payload === null || loadFailed) {
    return (
      <p class={styles.notice} data-tone="error" role="alert">
        {error === null ? labels.loadFailed : apiErrorMessage(error, labels.loadFailed)}
      </p>
    );
  }

  const submit = (status: "draft" | "published"): void => {
    if (saving !== null) {
      return;
    }

    setNotice(null);
    const parsed = parseSchema(schemaText);

    if (parsed === null) {
      setNotice({ message: labels.formatFailed, tone: "error" });
      return;
    }

    if (!Number.isInteger(nextVersion) || nextVersion < 1) {
      setNotice({ message: labels.saveFailed, tone: "error" });
      return;
    }

    setSaving(status);

    void (async (): Promise<void> => {
      try {
        const response = await createFormVersion({
          param: { eventId: query.eventId ?? "" },
          json: { version: nextVersion, schema: parsed, status },
        });
        if (!response.ok) {
          const body = await response.json();
          const errorBody = "error" in body && typeof body.error === "object" ? body.error : null;
          const issues =
            errorBody !== null && "issues" in errorBody ? formIssues(errorBody.issues) : [];

          if (
            errorBody !== null &&
            "code" in errorBody &&
            errorBody.code === "event_invalid_form_schema" &&
            issues.length > 0
          ) {
            setNotice({
              message: apiResponseMessage(body, labels.formValidationFailed),
              tone: "error",
              issues,
            });
          } else {
            const fallback =
              status === FORM_VERSION_STATUS.published
                ? labels.formValidationFailed
                : labels.saveFailed;

            setNotice({ message: apiResponseMessage(body, fallback), tone: "error" });
          }
          return;
        }

        const body = await response.json();
        const version = body.data.formVersion.version;
        setNotice({
          message:
            status === FORM_VERSION_STATUS.published
              ? labels.formSavedPublished
              : labels.formSavedDraft,
          tone: "success",
        });
        adminRefresh.afterFormVersionWrite(query.eventId ?? "");
        await navigate(
          adminEventUrl(locale, {
            eventId: query.eventId ?? "",
            view: "preview",
            params: new URLSearchParams({ version: String(version) }),
          }),
        );
      } catch (error_) {
        clientLogger.error(error_);
        setNotice({
          message: apiErrorMessage(error_, labels.saveFailed),
          tone: "error",
        });
      } finally {
        setSaving(null);
      }
    })();
  };

  return (
    <form
      id="engine-form-editor"
      class={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        submit(FORM_VERSION_STATUS.draft);
      }}
    >
      <div
        id="engine-form-editor-notice"
        ref={noticeRef}
        class={styles.notice}
        role={notice?.tone === "error" ? "alert" : "status"}
        tabIndex={-1}
        data-tone={notice?.tone === "error" ? "error" : undefined}
        hidden={notice === null}
      >
        {notice === null ? null : (
          <>
            <strong>{notice.message}</strong>
            {notice.issues === undefined || notice.issues.length === 0 ? null : (
              <ul class={styles.errorList}>
                {notice.issues.map((issue) => (
                  <li key={`${issue.path}-${issue.message}`}>
                    {issue.path}: {issue.message}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <div class={styles.panel}>
        <h2 class={styles.sectionTitle}>{labels.formSchema}</h2>
        <p class={styles.sectionDescription}>{labels.formEditorCopyNotice}</p>
        <div class={styles.meta}>
          <span class={styles.badge}>
            {labels.sourceVersion}: <span>{sourceVersion === null ? "—" : sourceVersion}</span>
          </span>
          <span class={styles.badge}>
            {labels.newVersion}: <span>{nextVersion}</span>
          </span>
          <span class={styles.badge}>
            {labels.active}: <span>{activeTickets}</span>
          </span>
        </div>
        {activeTickets === 0 ? (
          <p class={styles.notice} data-tone="error" role="alert">
            {labels.noTicketTypesForForm}
          </p>
        ) : null}

        <qui-accordion collapsible class={styles.sectionBody}>
          <qui-accordion-item value="json-instructions">
            <qui-accordion-trigger>{labels.formSchemaInstructionsTitle}</qui-accordion-trigger>
            <qui-accordion-content>
              <div class={styles.instructions}>
                <p class={styles.instructionsText}>{labels.formSchemaInstructionsIntro}</p>
                <p class={styles.instructionsText}>{labels.formSchemaInstructionsKeys}</p>
                <p class={styles.instructionsText}>{labels.formSchemaInstructionsRefs}</p>
                <p class={styles.instructionsText}>{labels.formSchemaInstructionsLocalized}</p>
                <p class={styles.instructionsText}>{labels.formSchemaInstructionsConditions}</p>
                <p class={styles.instructionsText}>{labels.formSchemaInstructionsValidation}</p>
                <div>
                  <p class={styles.label}>{labels.formSchemaInstructionsExample}</p>
                  <pre class={styles.instructionsCode}>
                    <code>{FORM_SCHEMA_EXAMPLE}</code>
                  </pre>
                </div>
              </div>
            </qui-accordion-content>
          </qui-accordion-item>
        </qui-accordion>

        <qui-field class={`${styles.field} ${styles.sectionBody}`}>
          <qui-field-label>{labels.formSchema}</qui-field-label>
          <qui-textarea
            id="engine-form-schema"
            value={schemaText}
            rows={20}
            resize="vertical"
            maxLength={MAX_FORM_SCHEMA_BYTES}
            required
            onvaluechange={(event) => {
              setSchemaText(event.detail.value);
            }}
          />
          <qui-field-helper-text>{labels.formSchemaHelp}</qui-field-helper-text>
        </qui-field>

        <div class={styles.actions}>
          <qui-button
            variant="outlined"
            onClick={() => {
              const parsed = parseSchema(schemaText);

              if (parsed === null) {
                setNotice({ message: labels.formatFailed, tone: "error" });
                return;
              }

              setSchemaText(JSON.stringify(parsed, null, 2));
              setNotice(null);
            }}
          >
            {labels.formatJson}
          </qui-button>
          <qui-button
            type="button"
            variant="outlined"
            disabled={saving !== null}
            onClick={() => {
              submit(FORM_VERSION_STATUS.draft);
            }}
          >
            {saving === "draft" ? labels.saving : labels.saveDraft}
          </qui-button>
          <qui-button
            type="button"
            variant="filled"
            disabled={saving !== null}
            onClick={() => {
              submit(FORM_VERSION_STATUS.published);
            }}
          >
            {saving === "published" ? labels.saving : labels.publishForm}
          </qui-button>
          <qui-button href={detailUrl} variant="outlined">
            {labels.cancel}
          </qui-button>
        </div>
      </div>
    </form>
  );
}

export default FormEditor;
