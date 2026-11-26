// @boundary client
import type { JSX } from "preact";

import { adminStyles as styles } from "~/features/events/admin/ui/shared/styles/admin-styles";
import type { TicketTypeInput, TicketTypeRecord } from "~/features/events/domain/types";
import type { EventFormLabels } from "~/generated/client/EventForm";
import type { TicketTypeFormLabels } from "~/generated/client/TicketTypeForm";
import { locales, defaultLocale } from "~/platform/i18n";

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
    description: { ...record.description },
    priceMinor: String(record.priceMinor),
    minPerRegistration: String(record.minPerRegistration),
    maxPerRegistration: record.maxPerRegistration === null ? "" : String(record.maxPerRegistration),
    defaultQuantity: String(record.defaultQuantity),
    capacity: record.capacity === null ? "" : String(record.capacity),
    sortOrder: String(record.sortOrder),
    active: record.active,
  };
}

function optionalInteger(value: string) {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function requiredInteger(value: string) {
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

export function TicketTypeFields({
  draft,
  labels,
  removable,
  keyReadOnly,
  onChange,
  onRemove,
}: {
  draft: TicketTypeDraft;
  labels: TicketTypeFormLabels | EventFormLabels;
  removable?: boolean;
  keyReadOnly?: boolean;
  onChange: (next: TicketTypeDraft) => void;
  onRemove?: () => void;
}): JSX.Element {
  const update = (patch: Partial<TicketTypeDraft>): void => {
    onChange({ ...draft, ...patch });
  };
  const updateLabel = (language: string, value: string): void => {
    update({ label: { ...draft.label, [language]: value } });
  };
  const updateDescription = (language: string, value: string): void => {
    update({ description: { ...draft.description, [language]: value } });
  };

  return (
    <div class={styles.ticketCard} data-ticket>
      <div class={styles.ticketHeader}>
        <h3 class={styles.ticketTitle}>{labels.engineAdmin.ticketTypes}</h3>
        {removable === true ? (
          <qui-button variant="text" size="sm" onClick={onRemove}>
            {labels.shared.remove}
          </qui-button>
        ) : null}
      </div>

      <div class={styles.fieldGrid}>
        <qui-field class={styles.field}>
          <qui-field-label>{labels.engineAdmin.ticketKey}</qui-field-label>
          <qui-input
            value={draft.key}
            inputPattern="[a-z][a-z0-9_]{0,63}"
            readOnly={keyReadOnly === true}
            required
            onvaluechange={(event) => {
              update({ key: event.detail.value });
            }}
          />
          <qui-field-helper-text>a-z, 0-9, _</qui-field-helper-text>
        </qui-field>

        <qui-field class={styles.field}>
          <qui-field-label>{labels.engineAdmin.priceMinor}</qui-field-label>
          <qui-input
            value={draft.priceMinor}
            inputType="number"
            inputModeHint="numeric"
            min={0}
            step={1}
            required
            onvaluechange={(event) => {
              update({ priceMinor: event.detail.value });
            }}
          />
          <qui-field-helper-text>{labels.engineAdmin.priceMinorHelp}</qui-field-helper-text>
        </qui-field>

        {locales.map((language) => (
          <qui-field key={language} class={styles.field}>
            <qui-field-label>
              {labels.engineAdmin.ticketLabel} · {language}
            </qui-field-label>
            <qui-input
              value={draft.label[language] ?? ""}
              required={language === defaultLocale}
              onvaluechange={(event) => {
                updateLabel(language, event.detail.value);
              }}
            />
          </qui-field>
        ))}

        {locales.map((language) => (
          <qui-field key={language} class={styles.field}>
            <qui-field-label>
              {labels.engineAdmin.ticketDescription} · {language}
            </qui-field-label>
            <qui-input
              value={draft.description[language] ?? ""}
              onvaluechange={(event) => {
                updateDescription(language, event.detail.value);
              }}
            />
          </qui-field>
        ))}
      </div>

      <div class={styles.fieldGrid}>
        <qui-field class={styles.field}>
          <qui-field-label>{labels.engineAdmin.minPerRegistration}</qui-field-label>
          <qui-input
            value={draft.minPerRegistration}
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
          <qui-field-label>{labels.engineAdmin.maxPerRegistration}</qui-field-label>
          <qui-input
            value={draft.maxPerRegistration}
            inputType="number"
            inputModeHint="numeric"
            min={0}
            step={1}
            onvaluechange={(event) => {
              update({ maxPerRegistration: event.detail.value });
            }}
          />
          <qui-field-helper-text>{labels.engineAdmin.noLimit}</qui-field-helper-text>
        </qui-field>

        <qui-field class={styles.field}>
          <qui-field-label>{labels.engineAdmin.defaultQuantity}</qui-field-label>
          <qui-input
            value={draft.defaultQuantity}
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
          <qui-field-label>{labels.engineAdmin.capacity}</qui-field-label>
          <qui-input
            value={draft.capacity}
            inputType="number"
            inputModeHint="numeric"
            min={0}
            step={1}
            onvaluechange={(event) => {
              update({ capacity: event.detail.value });
            }}
          />
          <qui-field-helper-text>{labels.engineAdmin.noLimit}</qui-field-helper-text>
        </qui-field>

        <qui-field class={styles.field}>
          <qui-field-label>{labels.engineAdmin.sortOrder}</qui-field-label>
          <qui-input
            value={draft.sortOrder}
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
          checked={draft.active}
          label={labels.shared.active}
          oncheckedchange={(event) => {
            update({ active: event.detail.checked === true });
          }}
        />
      </div>
    </div>
  );
}
