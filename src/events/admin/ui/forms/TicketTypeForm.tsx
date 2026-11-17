// @boundary client
import { navigate } from "astro:transitions/client";
import type { JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

import { adminQueries, adminRefresh } from "~/events/admin/ui/shared/queries";
import { adminEventUrl } from "~/events/admin/ui/shared/routes";
import { adminStyles as styles } from "~/events/admin/ui/shared/styles/admin-styles";
import { apiClient, apiResponseMessage, readApiJson } from "~/shared/client/api/client";
import { clientLogger } from "~/shared/client/logger";
import { useQuery } from "~/shared/client/query/use-query";

import {
  TicketTypeFields,
  emptyTicketDraft,
  ticketDraft,
  ticketInput,
  type TicketFieldsConfig,
  type TicketTypeDraft,
} from "./TicketTypeFields";

export interface TicketTypeMessages {
  saving: string;
  saveFailed: string;
  invalidPayload: string;
  ticketTypeExists: string;
  archiveConfirm: string;
  archiveFailed: string;
  loadFailed: string;
}

export interface TicketTypeText {
  newTicketType: string;
  editTicketType: string;
  ticketTypeIntro: string;
  addTicketType: string;
  save: string;
  archiveTicketType: string;
  cancel: string;
}

export interface TicketTypeConfig {
  locale: string;
  messages: TicketTypeMessages;
  text: TicketTypeText;
  ticket: TicketFieldsConfig;
}

const createTicketType = apiClient.api.admin.events[":eventId"]["ticket-types"].$post;
const updateTicketType = apiClient.api.admin.events[":eventId"]["ticket-types"][":key"].$patch;
interface Notice {
  message: string;
  tone: "success" | "error";
}

export function TicketTypeForm(props: {
  mode: "create" | "edit";
  config: TicketTypeConfig;
}): JSX.Element | null {
  const [query, setQuery] = useState<{ eventId: string | null; key: string | null }>({
    eventId: null,
    key: null,
  });
  const [queryReady, setQueryReady] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const noticeRef = useRef<HTMLDivElement | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<TicketTypeDraft | null>(
    props.mode === "create" ? emptyTicketDraft() : null,
  );

  useEffect(() => {
    const params = new URLSearchParams(globalThis.location.search);
    setQuery({ eventId: params.get("event"), key: params.get("key") });
    setQueryReady(true);
  }, []);

  const eventId = query.eventId;
  const { data, error, loading } = useQuery(
    props.mode === "edit" && eventId !== null ? adminQueries.event(eventId) : null,
  );

  useEffect(() => {
    if (props.mode !== "edit" || data?.event === undefined || query.key === null) {
      return;
    }

    const ticket = data.event.ticketTypes.find((entry) => entry.key === query.key);

    if (ticket !== undefined) {
      setDraft(ticketDraft(ticket));
    }
  }, [data, props.mode, query.key]);

  useEffect(() => {
    if (notice !== null) {
      noticeRef.current?.focus();
    }
  }, [notice]);

  if (!queryReady || (props.mode === "edit" && loading)) {
    return null;
  }

  if (query.eventId === null || (props.mode === "edit" && (error !== null || draft === null))) {
    return (
      <p class={styles.notice} data-tone="error" role="alert">
        {props.config.messages.loadFailed}
      </p>
    );
  }

  const current = draft ?? emptyTicketDraft();
  const detailUrl = adminEventUrl(props.config.locale, { eventId: query.eventId });
  const submit = (event: Event): void => {
    event.preventDefault();
    const form = formRef.current;

    if (form === null || saving) {
      return;
    }

    setNotice(null);

    if (!form.reportValidity()) {
      return;
    }

    const ticket = ticketInput(current, props.mode === "create");

    if (ticket === null) {
      setNotice({ message: props.config.messages.invalidPayload, tone: "error" });
      return;
    }

    setSaving(true);

    void (async (): Promise<void> => {
      try {
        const response =
          props.mode === "create"
            ? await createTicketType({
                param: { eventId: query.eventId ?? "" },
                json: ticket,
              })
            : await updateTicketType({
                param: { eventId: query.eventId ?? "", key: query.key ?? "" },
                json: ticket,
              });
        if (!response.ok) {
          const body = await response.json();
          const errorBody = "error" in body && typeof body.error === "object" ? body.error : null;
          const fields =
            errorBody !== null && "fields" in errorBody && Array.isArray(errorBody.fields)
              ? errorBody.fields.filter(
                  (field: unknown): field is string => typeof field === "string",
                )
              : [];
          const fieldSuffix = fields.length > 0 ? ` (${fields.join(", ")})` : "";
          setNotice({
            message: `${apiResponseMessage(body, props.config.messages.saveFailed)}${fieldSuffix}`,
            tone: "error",
          });
          return;
        }

        adminRefresh.afterTicketTypeWrite(query.eventId ?? "");
        await navigate(detailUrl);
      } catch (error_) {
        clientLogger.error(error_);
        setNotice({ message: props.config.messages.saveFailed, tone: "error" });
      } finally {
        setSaving(false);
      }
    })();
  };

  const archive = (): void => {
    // oxlint-disable-next-line eslint/no-alert -- Native confirmation is sufficient for this admin-only destructive action.
    if (!globalThis.confirm(props.config.messages.archiveConfirm)) {
      return;
    }

    setSaving(true);

    void (async (): Promise<void> => {
      try {
        await readApiJson(
          await updateTicketType({
            param: { eventId: query.eventId ?? "", key: query.key ?? "" },
            json: { active: false },
          }),
        );

        adminRefresh.afterTicketTypeWrite(query.eventId ?? "");
        await navigate(detailUrl);
      } catch (error_) {
        clientLogger.error(error_);
        setNotice({ message: props.config.messages.archiveFailed, tone: "error" });
      } finally {
        setSaving(false);
      }
    })();
  };

  const submitLabel = (): string => {
    if (saving) {
      return props.config.messages.saving;
    }

    return props.mode === "create" ? props.config.text.addTicketType : props.config.text.save;
  };
  return (
    <form
      id="engine-ticket-type-form"
      ref={formRef}
      class={styles.form}
      novalidate
      onSubmit={submit}
    >
      <div
        id="engine-ticket-type-notice"
        ref={noticeRef}
        class={styles.notice}
        role={notice?.tone === "error" ? "alert" : "status"}
        tabIndex={-1}
        data-tone={notice?.tone === "error" ? "error" : undefined}
        hidden={notice === null}
      >
        {notice?.message}
      </div>

      <div class={styles.panel}>
        <h2 class={styles.sectionTitle}>
          {props.mode === "create"
            ? props.config.text.newTicketType
            : props.config.text.editTicketType}
        </h2>
        <p class={styles.sectionDescription}>{props.config.text.ticketTypeIntro}</p>
        <div class={styles.sectionBody}>
          <TicketTypeFields
            draft={current}
            config={props.config.ticket}
            keyReadOnly={props.mode === "edit"}
            onChange={setDraft}
          />
        </div>
      </div>

      <div class={styles.actions}>
        <qui-button type="submit" variant="filled" disabled={saving}>
          {submitLabel()}
        </qui-button>
        {props.mode === "edit" && current.active ? (
          <qui-button variant="outlined" disabled={saving} onClick={archive}>
            {props.config.text.archiveTicketType}
          </qui-button>
        ) : null}
        <qui-button href={detailUrl} variant="outlined">
          {props.config.text.cancel}
        </qui-button>
      </div>
    </form>
  );
}

export default TicketTypeForm;
