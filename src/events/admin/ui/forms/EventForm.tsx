// @boundary client
/* oxlint-disable eslint/complexity, import/max-dependencies, eslint/max-lines, eslint/max-lines-per-function, eslint/no-negated-condition, eslint/no-nested-ternary, eslint/no-plusplus, oxc/no-map-spread, react/no-array-index-key, react/purity, unicorn/no-negated-condition, unicorn/no-nested-ternary -- Admin forms keep related editable sections together and copy nested note blocks before mutating state. */
import { navigate } from "astro:transitions/client";
import type { InferRequestType } from "hono/client";
import { locales, type DeclaredLocales } from "intlayer";
import type { JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

import { rememberEventTitle } from "~/events/admin/ui/shared/event-titles";
import { adminQueries, adminRefresh } from "~/events/admin/ui/shared/queries";
import { adminCatalogUrl, adminEventUrl } from "~/events/admin/ui/shared/routes";
import { adminStyles as styles } from "~/events/admin/ui/shared/styles/admin-styles";
import { EVENT_STATUS } from "~/events/domain/constants";
import { DEFAULT_CURRENCY, DEFAULT_TIMEZONE } from "~/events/domain/defaults";
import {
  MAX_CURRENCY_CODE_LENGTH,
  MAX_EVENT_ALIASES_TEXT_LENGTH,
  MAX_EVENT_CASH_ADDRESS_LENGTH,
  MAX_EVENT_LOCATION_ADDRESS_LENGTH,
  MAX_EVENT_SLUG_LENGTH,
  MAX_EVENT_SUMMARY_LENGTH,
  MAX_EVENT_TYPE_LENGTH,
} from "~/events/domain/limits";
import { EMAIL_PATTERN } from "~/events/domain/patterns";
import type {
  EventDetail,
  EventNoteBlock,
  EventNotes,
  EventStatus,
  TicketTypeInput,
} from "~/events/domain/types";
import { apiClient, apiResponseMessage } from "~/shared/client/api/client";
import { readFormChecked, readFormValue } from "~/shared/client/form-controls";
import { clientLogger } from "~/shared/client/logger";
import { useQuery } from "~/shared/client/query/use-query";
import { DEFAULT_LOCALE } from "~/shared/constants/locales";
import { toIsoDateTime, toLocalDateTime } from "~/shared/utils/datetime";

import type { EventFormLabels } from "./form-labels";
import { NoteBlockFields } from "./NoteBlockFields";
import {
  TicketTypeFields,
  emptyTicketDraft,
  ticketDraft,
  ticketInput,
  type TicketTypeDraft,
} from "./TicketTypeFields";

const LANGUAGES = locales as readonly string[];
const EVENT_STATUSES = Object.values(EVENT_STATUS);

const createEvent = apiClient.api.admin.events.$post;
const updateEvent = apiClient.api.admin.events[":eventId"].$patch;
type EventCreateJson = InferRequestType<typeof createEvent>["json"];

interface Notice {
  message: string;
  tone: "success" | "error";
}

interface TicketDraftState {
  id: number;
  draft: TicketTypeDraft;
}

let nextTicketId = 1;

function newTicket(draft: TicketTypeDraft): TicketDraftState {
  return { id: nextTicketId++, draft };
}

function nullableText(value: string) {
  return value.length > 0 ? value : null;
}

function nullableInteger(value: string) {
  if (value.length === 0) {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function aliasValues(value: string): string[] {
  return value
    .split(/[\n,]+/u)
    .map((alias) => alias.trim().toLowerCase())
    .filter((alias) => alias.length > 0);
}

function eventStatusLabel(status: EventStatus, text: EventFormLabels) {
  switch (status) {
    case EVENT_STATUS.draft: {
      return text.statusDraft;
    }
    case EVENT_STATUS.upcoming: {
      return text.statusUpcoming;
    }
    case EVENT_STATUS.active: {
      return text.statusActive;
    }
    case EVENT_STATUS.archived: {
      return text.statusArchived;
    }
    default: {
      return status;
    }
  }
}

function selectedEventStatus(value: string): EventStatus | null {
  return Object.values(EVENT_STATUS).find((status) => status === value) ?? null;
}

function selectedLocale(value: string): NonNullable<EventCreateJson["defaultLocale"]> | null {
  return locales.find((locale) => locale === value) ?? null;
}

function localizedValues(
  value: (name: string) => string,
  prefix: "title" | "summary",
): Record<string, string> {
  const values: Record<string, string> = {};

  for (const language of LANGUAGES) {
    const text = value(`${prefix}-${language}`).trim();

    if (text.length > 0) {
      values[language] = text;
    }
  }

  return values;
}

function cleanNotes(notes: EventNotes): EventNotes {
  const result: EventNotes = {};

  for (const [language, blocks] of Object.entries(notes)) {
    const cleaned: EventNoteBlock[] = [];

    for (const block of blocks) {
      if (block.type === "paragraph") {
        const text = block.text.trim();

        if (text.length > 0) {
          cleaned.push({ type: "paragraph", text });
        }
      } else if (block.type === "bullets") {
        const items = block.items.map((item) => item.trim()).filter((item) => item.length > 0);

        if (items.length > 0) {
          cleaned.push({ type: "bullets", items });
        }
      } else {
        const label = block.label.trim();
        const href = block.href.trim();

        if (label.length > 0 && href.length > 0) {
          cleaned.push({ type: "link", label, href });
        }
      }
    }

    if (cleaned.length > 0) {
      result[language] = cleaned;
    }
  }

  return result;
}

function defaultNoteBlock(type: "paragraph" | "bullets" | "link"): EventNoteBlock {
  if (type === "paragraph") {
    return { type, text: "" };
  }

  if (type === "bullets") {
    return { type, items: [""] };
  }

  return { type, label: "", href: "" };
}

function EventFormBody({
  mode,
  locale,
  labels,
  event,
}: {
  mode: "create" | "edit" | "clone";
  locale: DeclaredLocales;
  labels: EventFormLabels;
  event: EventDetail | null;
}) {
  const clone = mode === "clone";
  const source = event;
  const defaultEventLocale = source?.defaultLocale ?? DEFAULT_LOCALE;
  const notes = source?.notes ?? {};
  const formRef = useRef<HTMLFormElement | null>(null);
  const noticeRef = useRef<HTMLDivElement | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [saving, setSaving] = useState(false);
  const [ticketStates, setTicketStates] = useState<TicketDraftState[]>(() => {
    if (mode === "edit") {
      return [];
    }

    return source === null
      ? [newTicket(emptyTicketDraft())]
      : source.ticketTypes.map((ticket) => newTicket(ticketDraft(ticket)));
  });
  const [noteState, setNoteState] = useState<EventNotes>(() => {
    const initial: EventNotes = {};

    for (const language of LANGUAGES) {
      initial[language] = [...(notes[language] ?? [])].map((block) => ({
        ...block,
      }));
    }

    return initial;
  });

  useEffect(() => {
    if (notice !== null) {
      noticeRef.current?.focus();
    }
  }, [notice]);

  const value = (name: string) =>
    formRef.current === null ? "" : readFormValue(formRef.current, name).trim();
  const checked = (name: string) =>
    formRef.current !== null && readFormChecked(formRef.current, name);

  const updateNote = (language: string, index: number, block: EventNoteBlock) => {
    setNoteState((current) => {
      const blocks = [...(current[language] ?? [])];
      blocks[index] = block;
      return { ...current, [language]: blocks };
    });
  };

  const moveNote = (language: string, index: number, direction: -1 | 1) => {
    setNoteState((current) => {
      const blocks = [...(current[language] ?? [])];
      const target = index + direction;

      if (target < 0 || target >= blocks.length) {
        return current;
      }

      const currentBlock = blocks[index];
      const targetBlock = blocks[target];

      if (currentBlock === undefined || targetBlock === undefined) {
        return current;
      }

      [blocks[index], blocks[target]] = [targetBlock, currentBlock];
      return { ...current, [language]: blocks };
    });
  };

  const removeNote = (language: string, index: number) => {
    setNoteState((current) => ({
      ...current,
      [language]: (current[language] ?? []).filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const addNote = (language: string, type: "paragraph" | "bullets" | "link") => {
    setNoteState((current) => ({
      ...current,
      [language]: [...(current[language] ?? []), defaultNoteBlock(type)],
    }));
  };

  const updateTicket = (index: number, next: TicketTypeDraft) => {
    setTicketStates((current) =>
      current.map((ticket, itemIndex) =>
        itemIndex === index ? { ...ticket, draft: next } : ticket,
      ),
    );
  };

  const submit = (submitEvent: Event) => {
    submitEvent.preventDefault();
    const form = formRef.current;

    if (form === null || saving) {
      return;
    }

    setNotice(null);

    if (!form.reportValidity()) {
      return;
    }

    const title = localizedValues(value, "title");
    const summary = localizedValues(value, "summary");
    const startsAtRaw = value("startsAt");
    const endsAtRaw = value("endsAt");
    const startsAt = toIsoDateTime(startsAtRaw);
    const endsAt = toIsoDateTime(endsAtRaw);

    if (
      Object.keys(title).length === 0 ||
      (startsAtRaw.length > 0 && startsAt === null) ||
      (endsAtRaw.length > 0 && endsAt === null)
    ) {
      setNotice({ message: labels.invalidPayload, tone: "error" });
      return;
    }

    const ticketInputs =
      mode === "edit" ? [] : ticketStates.map((state) => ticketInput(state.draft, true));
    const invalidTickets =
      mode !== "edit" &&
      (ticketInputs.length === 0 || ticketInputs.some((ticket) => ticket === null));

    if (invalidTickets) {
      setNotice({ message: labels.invalidPayload, tone: "error" });
      return;
    }

    const status = selectedEventStatus(value("status"));
    const defaultLocale = selectedLocale(value("defaultLocale"));

    if (status === null || defaultLocale === null) {
      setNotice({ message: labels.invalidPayload, tone: "error" });
      return;
    }

    const ticketTypes = ticketInputs.filter((ticket): ticket is TicketTypeInput => ticket !== null);

    const payload: EventCreateJson = {
      slug: source?.slug ?? value("slug"),
      eventType: source?.eventType ?? value("eventType"),
      editionYear: source?.editionYear ?? Number(value("editionYear")),
      ticketTypes: mode === "edit" ? (source?.ticketTypes ?? []) : ticketTypes,
      defaultLocale,
      aliases: aliasValues(value("aliases")),
      title,
      summary,
      startsAt,
      endsAt,
      timezone: value("timezone") || DEFAULT_TIMEZONE,
      status,
      enabled: checked("enabled"),
      registrationOpen: checked("registrationOpen"),
      limits: {
        currency: value("currency").toUpperCase(),
        maxTicketsPerRegistration: nullableInteger(value("maxTicketsPerRegistration")),
        maxTotalTickets: nullableInteger(value("maxTotalTickets")),
      },
      location: {
        name: value("locationName"),
        address: value("locationAddress"),
        mapUrl: nullableText(value("locationMapUrl")),
        mapEmbedUrl: nullableText(value("locationMapEmbedUrl")),
      },
      payments: {
        etransfer: {
          enabled: checked("etransferEnabled"),
          email: nullableText(value("etransferEmail")),
        },
        cash: {
          enabled: checked("cashEnabled"),
          address: nullableText(value("cashAddress")),
          mapUrl: nullableText(value("cashMapUrl")),
          mapEmbedUrl: nullableText(value("cashMapEmbedUrl")),
        },
      },
      notes: cleanNotes(noteState),
    };

    const eventId = source?.id ?? "";

    setSaving(true);

    void (async () => {
      try {
        const response =
          mode === "edit"
            ? await updateEvent({
                param: { eventId },
                json: payload,
              })
            : await createEvent({ json: payload });
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
            message: `${apiResponseMessage(body, labels.saveFailed)}${fieldSuffix}`,
            tone: "error",
          });
          return;
        }

        const body = await response.json();

        rememberEventTitle(body.data.event);
        adminRefresh.afterEventWrite(body.data.event.id);

        if (mode !== "edit") {
          await navigate(adminEventUrl(locale, { eventId: body.data.event.id }));
          return;
        }

        setNotice({ message: labels.saved, tone: "success" });
      } catch (error) {
        clientLogger.error(error);
        setNotice({ message: labels.saveFailed, tone: "error" });
      } finally {
        setSaving(false);
      }
    })();
  };

  const text = labels;
  const ticketConfig = labels;
  const submitLabel =
    mode === "create" ? text.createEvent : mode === "clone" ? text.cloneEvent : text.saveEvent;
  const intro =
    mode === "create"
      ? text.createEventIntro
      : mode === "clone"
        ? text.cloneEventIntro
        : text.editEventIntro;
  const defaultStatus = clone ? EVENT_STATUS.draft : (source?.status ?? EVENT_STATUS.draft);
  const detailHref =
    source === null ? adminCatalogUrl(locale) : adminEventUrl(locale, { eventId: source.id });

  return (
    <form id="engine-event-form" ref={formRef} class={styles.form} novalidate onSubmit={submit}>
      <div
        id="engine-event-notice"
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
        <h2 class={styles.sectionTitle}>{text.eventIdentity}</h2>
        <p class={styles.sectionDescription}>{intro}</p>

        <div class={`${styles.fieldGrid} ${styles.sectionBody}`}>
          {mode === "edit" ? (
            <div class={styles.fieldWide}>
              <p class={styles.readOnly}>
                {text.slug}: <strong>{source?.slug}</strong> · {text.eventType}:{" "}
                <strong>{source?.eventType}</strong> · {text.editionYear}:{" "}
                <strong>{source?.editionYear}</strong>
              </p>
            </div>
          ) : (
            <>
              <qui-field class={styles.field}>
                <qui-field-label>{text.slug}</qui-field-label>
                <qui-input
                  name="slug"
                  inputPattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  maxLength={MAX_EVENT_SLUG_LENGTH}
                  defaultValue={clone ? `${source?.slug ?? ""}-copy` : ""}
                  required
                />
                <qui-field-helper-text>lowercase-with-hyphens</qui-field-helper-text>
              </qui-field>
              <qui-field class={styles.field}>
                <qui-field-label>{text.eventType}</qui-field-label>
                <qui-input
                  name="eventType"
                  inputPattern="[a-z][a-z0-9-]*"
                  maxLength={MAX_EVENT_TYPE_LENGTH}
                  defaultValue={source?.eventType ?? ""}
                  required
                />
                <qui-field-helper-text>lowercase-with-hyphens</qui-field-helper-text>
              </qui-field>
              <qui-field class={styles.field}>
                <qui-field-label>{text.editionYear}</qui-field-label>
                <qui-input
                  name="editionYear"
                  inputType="number"
                  inputModeHint="numeric"
                  min={2000}
                  max={2100}
                  step={1}
                  defaultValue={String(
                    clone
                      ? (source?.editionYear ?? new Date().getFullYear()) + 1
                      : (source?.editionYear ?? 2027),
                  )}
                  required
                />
              </qui-field>
            </>
          )}

          <qui-field class={styles.field}>
            <qui-field-label>{text.status}</qui-field-label>
            <qui-select
              name="status"
              defaultValue={[defaultStatus]}
              items={EVENT_STATUSES.map((status) => ({
                value: status,
                label: eventStatusLabel(status, text),
                disabled: false,
              }))}
            />
          </qui-field>

          <qui-field class={styles.field}>
            <qui-field-label>{text.defaultLocale}</qui-field-label>
            <qui-select
              name="defaultLocale"
              defaultValue={[defaultEventLocale]}
              items={LANGUAGES.map((language) => ({
                value: language,
                label: language.toUpperCase(),
                disabled: false,
              }))}
            />
            <qui-field-helper-text>{text.defaultLocaleHelp}</qui-field-helper-text>
          </qui-field>

          <qui-field class={styles.field}>
            <qui-field-label>{text.aliases}</qui-field-label>
            <qui-textarea
              name="aliases"
              rows={3}
              maxLength={MAX_EVENT_ALIASES_TEXT_LENGTH}
              defaultValue={clone ? "" : (source?.aliases ?? []).join("\n")}
            />
            <qui-field-helper-text>{text.aliasesHelp}</qui-field-helper-text>
          </qui-field>

          <qui-field class={styles.field}>
            <qui-field-label>{text.timezone}</qui-field-label>
            <qui-input
              name="timezone"
              defaultValue={source?.timezone ?? DEFAULT_TIMEZONE}
              required
            />
          </qui-field>

          <div class={styles.fieldWide}>
            <qui-checkbox
              name="enabled"
              defaultChecked={clone ? false : (source?.enabled ?? false)}
            >
              {text.enabled}
            </qui-checkbox>
          </div>
          <div class={styles.fieldWide}>
            <qui-checkbox
              name="registrationOpen"
              defaultChecked={clone ? false : (source?.registrationOpen ?? false)}
            >
              {text.registrationOpen}
            </qui-checkbox>
          </div>
        </div>
      </div>

      <div class={styles.panel}>
        <h2 class={styles.sectionTitle}>{text.localizedContent}</h2>
        <div class={styles.fieldGrid}>
          {LANGUAGES.map((language) => (
            <qui-field key={`title-${language}`} class={styles.field}>
              <qui-field-label>
                {text.eventTitle} · {language.toUpperCase()}
              </qui-field-label>
              <qui-input name={`title-${language}`} defaultValue={source?.title[language] ?? ""} />
              {language === defaultEventLocale ? null : (
                <qui-field-helper-text>{text.optionalTranslation}</qui-field-helper-text>
              )}
            </qui-field>
          ))}
          {LANGUAGES.map((language) => (
            <qui-field key={`summary-${language}`} class={styles.field}>
              <qui-field-label>
                {text.summary} · {language.toUpperCase()}
              </qui-field-label>
              <qui-textarea
                name={`summary-${language}`}
                defaultValue={source?.summary[language] ?? ""}
                rows={3}
                maxLength={MAX_EVENT_SUMMARY_LENGTH}
              />
              {language === defaultEventLocale ? null : (
                <qui-field-helper-text>{text.optionalTranslation}</qui-field-helper-text>
              )}
            </qui-field>
          ))}
          <qui-field class={styles.field}>
            <qui-field-label>{text.startsAt}</qui-field-label>
            <qui-input
              name="startsAt"
              defaultValue={toLocalDateTime(source?.startsAt ?? null)}
              placeholder="YYYY-MM-DDTHH:mm"
            />
          </qui-field>
          <qui-field class={styles.field}>
            <qui-field-label>{text.endsAt}</qui-field-label>
            <qui-input
              name="endsAt"
              defaultValue={toLocalDateTime(source?.endsAt ?? null)}
              placeholder="YYYY-MM-DDTHH:mm"
            />
          </qui-field>
        </div>
      </div>

      <div class={styles.panel}>
        <h2 class={styles.sectionTitle}>{text.eventLocation}</h2>
        <p class={styles.sectionDescription}>{text.optionalUrl}</p>
        <div class={styles.fieldGrid}>
          <qui-field class={styles.field}>
            <qui-field-label>{text.locationName}</qui-field-label>
            <qui-input name="locationName" defaultValue={source?.location.name ?? ""} />
          </qui-field>
          <qui-field class={styles.field}>
            <qui-field-label>{text.locationMapUrl}</qui-field-label>
            <qui-input
              name="locationMapUrl"
              inputModeHint="url"
              defaultValue={source?.location.mapUrl ?? ""}
            />
            <qui-field-helper-text>{text.optionalUrl}</qui-field-helper-text>
          </qui-field>
          <qui-field class={`${styles.field} ${styles.fieldWide}`}>
            <qui-field-label>{text.locationAddress}</qui-field-label>
            <qui-textarea
              name="locationAddress"
              rows={3}
              maxLength={MAX_EVENT_LOCATION_ADDRESS_LENGTH}
              defaultValue={source?.location.address ?? ""}
            />
          </qui-field>
          <qui-field class={`${styles.field} ${styles.fieldWide}`}>
            <qui-field-label>{text.locationMapEmbedUrl}</qui-field-label>
            <qui-input
              name="locationMapEmbedUrl"
              inputModeHint="url"
              defaultValue={source?.location.mapEmbedUrl ?? ""}
            />
            <qui-field-helper-text>{text.optionalUrl}</qui-field-helper-text>
          </qui-field>
        </div>
      </div>

      <div class={styles.panel}>
        <h2 class={styles.sectionTitle}>{text.eventLimits}</h2>
        <div class={styles.fieldGrid}>
          <qui-field class={styles.field}>
            <qui-field-label>{text.currency}</qui-field-label>
            <qui-input
              name="currency"
              maxLength={MAX_CURRENCY_CODE_LENGTH}
              inputPattern="[A-Z]{3}"
              defaultValue={source?.limits.currency ?? DEFAULT_CURRENCY}
              required
            />
          </qui-field>
          <qui-field class={styles.field}>
            <qui-field-label>{text.maxTicketsPerRegistration}</qui-field-label>
            <qui-input
              name="maxTicketsPerRegistration"
              inputType="number"
              inputModeHint="numeric"
              min={0}
              step={1}
              defaultValue={
                source?.limits.maxTicketsPerRegistration == null
                  ? ""
                  : String(source.limits.maxTicketsPerRegistration)
              }
            />
            <qui-field-helper-text>{text.noLimit}</qui-field-helper-text>
          </qui-field>
          <qui-field class={styles.field}>
            <qui-field-label>{text.maxTotalTickets}</qui-field-label>
            <qui-input
              name="maxTotalTickets"
              inputType="number"
              inputModeHint="numeric"
              min={0}
              step={1}
              defaultValue={
                source?.limits.maxTotalTickets == null ? "" : String(source.limits.maxTotalTickets)
              }
            />
            <qui-field-helper-text>{text.noLimit}</qui-field-helper-text>
          </qui-field>
        </div>
      </div>

      <div class={styles.panel}>
        <h2 class={styles.sectionTitle}>{text.paymentMethods}</h2>
        <div class={styles.fieldGrid}>
          <div class={styles.fieldWide}>
            <qui-checkbox
              name="etransferEnabled"
              defaultChecked={source?.payments.etransfer.enabled ?? false}
            >
              {text.etransferPayment}
            </qui-checkbox>
          </div>
          <qui-field class={styles.field}>
            <qui-field-label>{text.etransferEmail}</qui-field-label>
            <qui-input
              name="etransferEmail"
              inputType="text"
              inputModeHint="email"
              inputPattern={EMAIL_PATTERN}
              autocomplete="email"
              defaultValue={source?.payments.etransfer.email ?? ""}
            />
          </qui-field>
          <div class={styles.fieldWide}>
            <qui-checkbox
              name="cashEnabled"
              defaultChecked={source?.payments.cash.enabled ?? false}
            >
              {text.cashPayment}
            </qui-checkbox>
          </div>
          <qui-field class={`${styles.field} ${styles.fieldWide}`}>
            <qui-field-label>{text.cashAddress}</qui-field-label>
            <qui-textarea
              name="cashAddress"
              rows={3}
              maxLength={MAX_EVENT_CASH_ADDRESS_LENGTH}
              defaultValue={source?.payments.cash.address ?? ""}
            />
          </qui-field>
          <qui-field class={styles.field}>
            <qui-field-label>{text.cashMapUrl}</qui-field-label>
            <qui-input
              name="cashMapUrl"
              inputModeHint="url"
              defaultValue={source?.payments.cash.mapUrl ?? ""}
            />
            <qui-field-helper-text>{text.optionalUrl}</qui-field-helper-text>
          </qui-field>
          <qui-field class={styles.field}>
            <qui-field-label>{text.cashMapEmbedUrl}</qui-field-label>
            <qui-input
              name="cashMapEmbedUrl"
              inputModeHint="url"
              defaultValue={source?.payments.cash.mapEmbedUrl ?? ""}
            />
            <qui-field-helper-text>{text.optionalUrl}</qui-field-helper-text>
          </qui-field>
        </div>
      </div>

      <div class={styles.panel}>
        <h2 class={styles.sectionTitle}>{text.notesSection}</h2>
        <p class={styles.sectionDescription}>{text.notesHelp}</p>
        <qui-accordion multiple>
          {LANGUAGES.map((language) => (
            <qui-accordion-item key={language} value={language}>
              <qui-accordion-trigger>
                {text.notesSection} · {language.toUpperCase()}
              </qui-accordion-trigger>
              <qui-accordion-content>
                <div class={styles.noteEditor}>
                  {(noteState[language] ?? []).map((block, index) => (
                    <NoteBlockFields
                      key={`${language}-${index}-${block.type}`}
                      block={block}
                      labels={labels}
                      onChange={(next) => {
                        updateNote(language, index, next);
                      }}
                      onMoveUp={() => {
                        moveNote(language, index, -1);
                      }}
                      onMoveDown={() => {
                        moveNote(language, index, 1);
                      }}
                      onRemove={() => {
                        removeNote(language, index);
                      }}
                    />
                  ))}
                  <div class={styles.actions}>
                    <qui-button
                      variant="outlined"
                      size="sm"
                      onClick={() => {
                        addNote(language, "paragraph");
                      }}
                    >
                      {text.addParagraph}
                    </qui-button>
                    <qui-button
                      variant="outlined"
                      size="sm"
                      onClick={() => {
                        addNote(language, "bullets");
                      }}
                    >
                      {text.addBulletList}
                    </qui-button>
                    <qui-button
                      variant="outlined"
                      size="sm"
                      onClick={() => {
                        addNote(language, "link");
                      }}
                    >
                      {text.addLink}
                    </qui-button>
                  </div>
                </div>
              </qui-accordion-content>
            </qui-accordion-item>
          ))}
        </qui-accordion>
      </div>

      {mode !== "edit" ? (
        <div class={styles.panel}>
          <h2 class={styles.sectionTitle}>{text.initialTicketTypes}</h2>
          <div class={styles.form}>
            {ticketStates.map((ticket, index) => (
              <TicketTypeFields
                key={ticket.id}
                draft={ticket.draft}
                labels={ticketConfig}
                removable={ticketStates.length > 1}
                onChange={(next) => {
                  updateTicket(index, next);
                }}
                onRemove={() => {
                  setTicketStates((current) =>
                    current.filter((_, itemIndex) => itemIndex !== index),
                  );
                }}
              />
            ))}
          </div>
          <div class={styles.actions}>
            <qui-button
              variant="outlined"
              size="sm"
              onClick={() => {
                setTicketStates((current) => [...current, newTicket(emptyTicketDraft())]);
              }}
            >
              {text.addTicketType}
            </qui-button>
          </div>
        </div>
      ) : null}

      <div class={styles.actions}>
        <qui-button type="submit" variant="filled" disabled={saving}>
          {saving ? labels.saving : submitLabel}
        </qui-button>
        <qui-button href={detailHref} variant="outlined">
          {text.cancel}
        </qui-button>
      </div>
    </form>
  );
}

export function EventForm({
  mode,
  locale,
  labels,
}: {
  mode: "create" | "edit" | "clone";
  locale: DeclaredLocales;
  labels: EventFormLabels;
}): JSX.Element | null {
  const [eventId, setEventId] = useState<string | null>(null);
  const [queryReady, setQueryReady] = useState(false);

  useEffect(() => {
    setEventId(new URLSearchParams(globalThis.location.search).get("event"));
    setQueryReady(true);
  }, []);

  const needsEvent = mode !== "create";
  const { data, error, loading } = useQuery(
    eventId === null || !needsEvent ? null : adminQueries.event(eventId),
  );
  const event = data?.event ?? null;

  if (!needsEvent) {
    return <EventFormBody mode={mode} locale={locale} labels={labels} event={null} />;
  }

  if (!queryReady || loading) {
    return null;
  }

  if (error !== null || event === null) {
    return (
      <p class={styles.notice} data-tone="error" role="alert">
        {labels.loadFailed}
      </p>
    );
  }

  return <EventFormBody mode={mode} locale={locale} labels={labels} event={event} />;
}

export default EventForm;
