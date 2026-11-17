// @boundary client
/* oxlint-disable unicorn/no-useless-fallback-in-spread -- Ticket descriptions are optional and spread into a fresh object. */
import { locales } from "intlayer";
import type { JSX } from "preact";

import { adminStyles as styles } from "~/events/admin/ui/shared/styles/admin-styles";
import type { TicketTypeInput, TicketTypeRecord } from "~/events/domain/types";

const LANGUAGES = locales as readonly string[];
const DEFAULT_LANGUAGE = "en";

export interface TicketTypeDraft {
  key: string;
  label: Record<string, string>;
  description: Record<string, string>;
  priceMinor: string;
  minPerRegistration: string;
  maxPerRegistration: string;
  defaultQuantity: string;
  capacity: string;
  sortOrder: string;
  active: boolean;
}

export interface TicketFieldsConfig {
  ticketTypes: string;
  removeTicketType: string;
  ticketKey: string;
  priceMinor: string;
  priceMinorHelp: string;
  ticketLabel: string;
  ticketDescription: string;
  minPerRegistration: string;
  maxPerRegistration: string;
  defaultQuantity: string;
  capacity: string;
  sortOrder: string;
  active: string;
  noLimit: string;
}

export function emptyTicketDraft(): TicketTypeDraft {
  return {
    key: "",
    label: {},
    description: {},
    priceMinor: "0",
    minPerRegistration: "0",
    maxPerRegistration: "",
    defaultQuantity: "0",
    capacity: "",
    sortOrder: "0",
    active: true,
  };
}

export function ticketDraft(record: TicketTypeRecord): TicketTypeDraft {
  return {
    key: record.key,
    label: { ...record.label },
    description: { ...(record.description ?? {}) },
    priceMinor: String(record.priceMinor),
    minPerRegistration: String(record.minPerRegistration),
    maxPerRegistration: record.maxPerRegistration === null ? "" : String(record.maxPerRegistration),
    defaultQuantity: String(record.defaultQuantity),
    capacity: record.capacity === null ? "" : String(record.capacity),
    sortOrder: String(record.sortOrder),
    active: record.active,
  };
}

function optionalInteger(value: string): number | null {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function requiredInteger(value: string): number | null {
  const parsed = Number(value.trim());
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function localized(value: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(value).filter((entry) => entry[1].trim().length > 0));
}

export function ticketInput(draft: TicketTypeDraft, includeKey: boolean): TicketTypeInput | null {
  const priceMinor = requiredInteger(draft.priceMinor);
  const minPerRegistration = requiredInteger(draft.minPerRegistration);
  const defaultQuantity = requiredInteger(draft.defaultQuantity);
  const sortOrder = requiredInteger(draft.sortOrder);
  const maxPerRegistration = optionalInteger(draft.maxPerRegistration);
  const capacity = optionalInteger(draft.capacity);
  const label = localized(draft.label);
  const description = localized(draft.description);

  if (
    (includeKey && draft.key.trim().length === 0) ||
    Object.keys(label).length === 0 ||
    priceMinor === null ||
    minPerRegistration === null ||
    defaultQuantity === null ||
    sortOrder === null ||
    (draft.maxPerRegistration.trim().length > 0 && maxPerRegistration === null) ||
    (draft.capacity.trim().length > 0 && capacity === null)
  ) {
    return null;
  }

  return {
    key: draft.key.trim(),
    label,
    description: Object.keys(description).length > 0 ? description : null,
    priceMinor,
    minPerRegistration,
    maxPerRegistration,
    defaultQuantity,
    capacity,
    active: draft.active,
    sortOrder,
  };
}

export function TicketTypeFields(props: {
  draft: TicketTypeDraft;
  config: TicketFieldsConfig;
  removable?: boolean;
  keyReadOnly?: boolean;
  onChange: (next: TicketTypeDraft) => void;
  onRemove?: () => void;
}): JSX.Element {
  const update = (patch: Partial<TicketTypeDraft>): void => {
    props.onChange({ ...props.draft, ...patch });
  };
  const updateLabel = (language: string, value: string): void => {
    update({ label: { ...props.draft.label, [language]: value } });
  };
  const updateDescription = (language: string, value: string): void => {
    update({ description: { ...props.draft.description, [language]: value } });
  };

  return (
    <div class={styles.ticketCard} data-ticket>
      <div class={styles.ticketHeader}>
        <h3 class={styles.ticketTitle}>{props.config.ticketTypes}</h3>
        {props.removable === true ? (
          <qui-button variant="text" size="sm" onClick={props.onRemove}>
            {props.config.removeTicketType}
          </qui-button>
        ) : null}
      </div>

      <div class={styles.fieldGrid}>
        <qui-field class={styles.field}>
          <qui-field-label>{props.config.ticketKey}</qui-field-label>
          <qui-input
            value={props.draft.key}
            inputPattern="[a-z][a-z0-9_]{0,63}"
            readOnly={props.keyReadOnly === true}
            required
            onvaluechange={(event) => {
              update({ key: event.detail.value });
            }}
          />
          <qui-field-helper-text>a-z, 0-9, _</qui-field-helper-text>
        </qui-field>

        <qui-field class={styles.field}>
          <qui-field-label>{props.config.priceMinor}</qui-field-label>
          <qui-input
            value={props.draft.priceMinor}
            inputType="number"
            inputModeHint="numeric"
            min={0}
            step={1}
            required
            onvaluechange={(event) => {
              update({ priceMinor: event.detail.value });
            }}
          />
          <qui-field-helper-text>{props.config.priceMinorHelp}</qui-field-helper-text>
        </qui-field>

        {LANGUAGES.map((language) => (
          <qui-field key={language} class={styles.field}>
            <qui-field-label>
              {props.config.ticketLabel} · {language}
            </qui-field-label>
            <qui-input
              value={props.draft.label[language] ?? ""}
              required={language === DEFAULT_LANGUAGE}
              onvaluechange={(event) => {
                updateLabel(language, event.detail.value);
              }}
            />
          </qui-field>
        ))}

        {LANGUAGES.map((language) => (
          <qui-field key={language} class={styles.field}>
            <qui-field-label>
              {props.config.ticketDescription} · {language}
            </qui-field-label>
            <qui-input
              value={props.draft.description[language] ?? ""}
              onvaluechange={(event) => {
                updateDescription(language, event.detail.value);
              }}
            />
          </qui-field>
        ))}
      </div>

      <div class={styles.fieldGrid}>
        <qui-field class={styles.field}>
          <qui-field-label>{props.config.minPerRegistration}</qui-field-label>
          <qui-input
            value={props.draft.minPerRegistration}
            inputType="number"
            inputModeHint="numeric"
            min={0}
            step={1}
            required
            onvaluechange={(event) => {
              update({ minPerRegistration: event.detail.value });
            }}
          />
        </qui-field>

        <qui-field class={styles.field}>
          <qui-field-label>{props.config.maxPerRegistration}</qui-field-label>
          <qui-input
            value={props.draft.maxPerRegistration}
            inputType="number"
            inputModeHint="numeric"
            min={0}
            step={1}
            onvaluechange={(event) => {
              update({ maxPerRegistration: event.detail.value });
            }}
          />
          <qui-field-helper-text>{props.config.noLimit}</qui-field-helper-text>
        </qui-field>

        <qui-field class={styles.field}>
          <qui-field-label>{props.config.defaultQuantity}</qui-field-label>
          <qui-input
            value={props.draft.defaultQuantity}
            inputType="number"
            inputModeHint="numeric"
            min={0}
            step={1}
            required
            onvaluechange={(event) => {
              update({ defaultQuantity: event.detail.value });
            }}
          />
        </qui-field>

        <qui-field class={styles.field}>
          <qui-field-label>{props.config.capacity}</qui-field-label>
          <qui-input
            value={props.draft.capacity}
            inputType="number"
            inputModeHint="numeric"
            min={0}
            step={1}
            onvaluechange={(event) => {
              update({ capacity: event.detail.value });
            }}
          />
          <qui-field-helper-text>{props.config.noLimit}</qui-field-helper-text>
        </qui-field>

        <qui-field class={styles.field}>
          <qui-field-label>{props.config.sortOrder}</qui-field-label>
          <qui-input
            value={props.draft.sortOrder}
            inputType="number"
            inputModeHint="numeric"
            step={1}
            required
            onvaluechange={(event) => {
              update({ sortOrder: event.detail.value });
            }}
          />
        </qui-field>

        <qui-checkbox
          checked={props.draft.active}
          label={props.config.active}
          oncheckedchange={(event) => {
            update({ active: event.detail.checked === true });
          }}
        />
      </div>
    </div>
  );
}
