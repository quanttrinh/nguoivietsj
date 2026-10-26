/* oxlint-disable eslint/max-statements, eslint/max-params -- The advanced builder renders several schema sections in one pass. */

import { renderConditionEditor } from "./conditions";
import { checkboxInput, element, numberInput, selectInput, textareaInput, textInput } from "./dom";
import { asArray, asRecord, stringValue } from "./schema";
import { builderStyles } from "./styles";
import type { FormBuilderMessages, JsonRecord } from "./types";

interface AdvancedInput {
  container: HTMLElement;
  schema: JsonRecord;
  locale: string;
  messages: FormBuilderMessages;
  write: (schema: JsonRecord) => void;
}

const CUSTOM_TYPES = ["text", "textarea", "number", "select", "radio", "checkbox"] as const;
const GROUP_MODES = ["flat", "oneOf", "atLeastOne", "allOf"] as const;
const GROUP_RENDERERS = ["fieldset", "radio", "tabs", "flat"] as const;

function select(
  value: string,
  options: readonly string[],
  onChange: (value: string) => void,
): HTMLQuiSelectElement {
  return selectInput(
    value,
    options.map((option) => ({ value: option, label: option })),
    onChange,
  );
}

function localized(value: unknown): Record<string, string> {
  const record = asRecord(value);

  return record === null
    ? {}
    : Object.fromEntries(
        Object.entries(record).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      );
}

function customFields(schema: JsonRecord): JsonRecord[] {
  return asArray(schema.customFields)
    .map((item) => asRecord(item))
    .filter((item): item is JsonRecord => item !== null);
}

function groups(schema: JsonRecord): JsonRecord[] {
  return asArray(schema.groups)
    .map((item) => asRecord(item))
    .filter((item): item is JsonRecord => item !== null);
}

function fieldLabel(field: JsonRecord): Record<string, string> {
  const label = localized(field.label);
  field.label = label;
  return label;
}

function setLocalized(target: Record<string, string>, locale: string, value: string): void {
  target[locale] = value;
}

function optionsText(field: JsonRecord, locale: string): string {
  return asArray(field.options)
    .map((item) => asRecord(item))
    .filter((item): item is JsonRecord => item !== null)
    .map((item) => {
      const label = localized(item.label);
      const text = label[locale] ?? Object.values(label)[0] ?? "";

      return `${stringValue(item.value)}=${text}`;
    })
    .join("\n");
}

function parseOptions(text: string, locale: string, current: unknown): JsonRecord[] {
  const existing = new Map(
    asArray(current)
      .map((item) => asRecord(item))
      .filter((item): item is JsonRecord => item !== null)
      .map((item) => [stringValue(item.value), localized(item.label)]),
  );

  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [value, ...labelParts] = line.split("=");
      const optionValue = (value ?? "").trim();
      const label = labelParts.join("=").trim();
      const labels = existing.get(optionValue) ?? {};

      return {
        value: optionValue,
        label: { ...labels, [locale]: label.length > 0 ? label : optionValue },
      };
    });
}

function numberControl(
  label: string,
  value: number | undefined,
  step: number | undefined,
  onChange: (value?: number) => void,
  minimum?: number,
): HTMLLabelElement {
  const wrapper = element("label");
  wrapper.className = builderStyles.checkboxLabel;
  const node = numberInput(
    value,
    (next) => {
      const trimmed = next.trim();

      if (trimmed.length === 0) {
        onChange();
        return;
      }

      const parsed = Number(trimmed);

      if (Number.isFinite(parsed)) {
        onChange(parsed);
      }
    },
    label,
    step,
    minimum,
  );
  wrapper.append(document.createTextNode(label), node);
  return wrapper;
}

function setOptionalNumber(field: JsonRecord, key: string, value: number | undefined): void {
  if (value === undefined) {
    Reflect.deleteProperty(field, key);
    return;
  }

  field[key] = value;
}

function numericValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function defaultControl(
  field: JsonRecord,
  type: string,
  label: string,
  write: () => void,
): HTMLElement {
  const wrapper = element("label");
  wrapper.className = builderStyles.checkboxLabel;

  if (type === "checkbox") {
    const node = checkboxInput(field.defaultValue === true, label, (next) => {
      if (next) {
        field.defaultValue = true;
      } else {
        Reflect.deleteProperty(field, "defaultValue");
      }
      write();
    });
    return node;
  }

  const decorate = (node: HTMLElement): void => {
    wrapper.append(document.createTextNode(label), node);
  };

  if (type === "number") {
    const node = numberInput(
      typeof field.defaultValue === "number" ? field.defaultValue : undefined,
      (next) => {
        const trimmed = next.trim();

        if (trimmed.length === 0) {
          Reflect.deleteProperty(field, "defaultValue");
        } else {
          const parsed = Number(trimmed);

          if (Number.isFinite(parsed)) {
            field.defaultValue = parsed;
          }
        }

        write();
      },
      label,
    );
    decorate(node);
    return wrapper;
  }

  if (type === "select" || type === "radio") {
    const values = asArray(field.options)
      .map((item) => asRecord(item))
      .filter((item): item is JsonRecord => item !== null)
      .map((item) => stringValue(item.value))
      .filter((value) => value.length > 0);
    const node = select(stringValue(field.defaultValue), ["", ...values], (next) => {
      if (next.length === 0) {
        Reflect.deleteProperty(field, "defaultValue");
      } else {
        field.defaultValue = next;
      }

      write();
    });
    decorate(node);
    return wrapper;
  }

  const node = textInput(stringValue(field.defaultValue), (next) => {
    if (next.length === 0) {
      Reflect.deleteProperty(field, "defaultValue");
    } else {
      field.defaultValue = next;
    }

    write();
  });
  decorate(node);
  return wrapper;
}

function renderCustomFields(inputData: AdvancedInput): HTMLElement {
  const { schema, locale, messages, write } = inputData;
  const section = element("section");
  section.className = builderStyles.advanced;
  const heading = element("h4", messages.customFields);
  heading.className = builderStyles.heading;
  section.append(heading);
  const fields = customFields(schema);

  if (fields.length === 0) {
    section.append(element("p", messages.noCustomFields));
    return section;
  }

  for (const field of fields) {
    const card = element("div");
    card.className = builderStyles.advancedCard;
    const header = element("div");
    header.className = builderStyles.header;
    header.append(element("code", `custom.${stringValue(field.key)}`));
    card.append(header);

    const label = fieldLabel(field);
    const typeRow = element("div");
    typeRow.className = builderStyles.row;
    typeRow.append(
      select(stringValue(field.type) || "text", CUSTOM_TYPES, (next) => {
        field.type = next;

        if (next === "select" || next === "radio") {
          field.options =
            asArray(field.options).length > 0
              ? field.options
              : [{ value: "option_1", label: { [locale]: "Option 1" } }];
        } else {
          delete field.options;
        }

        if (next !== "text" && next !== "textarea") {
          delete field.minLength;
          delete field.maxLength;
        }

        if (next !== "textarea") {
          delete field.rows;
        }

        if (next !== "number") {
          delete field.min;
          delete field.max;
          delete field.step;
        }

        if (
          (next === "number" && typeof field.defaultValue !== "number") ||
          ((next === "text" || next === "textarea" || next === "select" || next === "radio") &&
            typeof field.defaultValue !== "string") ||
          (next === "checkbox" && typeof field.defaultValue !== "boolean")
        ) {
          delete field.defaultValue;
        }

        write(schema);
      }),
      checkboxInput(field.required === true, messages.fieldRequired, (next) => {
        field.required = next;
        write(schema);
      }),
    );
    card.append(typeRow);
    card.append(
      textInput(label[locale] ?? "", (next) => {
        setLocalized(label, locale, next);
        write(schema);
      }),
    );

    const help = localized(field.help);
    const placeholder = localized(field.placeholder);
    card.append(
      textInput(help[locale] ?? "", (next) => {
        help[locale] = next;
        field.help = help;
        write(schema);
      }),
      textInput(placeholder[locale] ?? "", (next) => {
        placeholder[locale] = next;
        field.placeholder = placeholder;
        write(schema);
      }),
    );

    const type = stringValue(field.type) || "text";
    const constraints = element("div");
    constraints.className = builderStyles.row;

    if (type === "text" || type === "textarea") {
      constraints.append(
        numberControl(
          messages.minLength,
          numericValue(field.minLength),
          1,
          (value) => {
            setOptionalNumber(field, "minLength", value);
            write(schema);
          },
          0,
        ),
        numberControl(
          messages.maxLength,
          numericValue(field.maxLength),
          1,
          (value) => {
            setOptionalNumber(field, "maxLength", value);
            write(schema);
          },
          0,
        ),
      );
    }

    if (type === "textarea") {
      constraints.append(
        numberControl(
          messages.rows,
          numericValue(field.rows),
          1,
          (value) => {
            setOptionalNumber(field, "rows", value);
            write(schema);
          },
          1,
        ),
      );
    }

    if (type === "number") {
      constraints.append(
        numberControl(messages.minValue, numericValue(field.min), undefined, (value) => {
          setOptionalNumber(field, "min", value);
          write(schema);
        }),
        numberControl(messages.maxValue, numericValue(field.max), undefined, (value) => {
          setOptionalNumber(field, "max", value);
          write(schema);
        }),
        numberControl(messages.step, numericValue(field.step), undefined, (value) => {
          if (value !== undefined && value > 0) {
            field.step = value;
          } else {
            Reflect.deleteProperty(field, "step");
          }
          write(schema);
        }),
      );
    }

    constraints.append(
      defaultControl(field, type, messages.defaultValue, () => {
        write(schema);
      }),
    );
    card.append(constraints);

    if (field.type === "select" || field.type === "radio") {
      card.append(
        element("p", messages.optionsHelp),
        textareaInput(optionsText(field, locale), (next) => {
          field.options = parseOptions(next, locale, field.options);
          write(schema);
        }),
      );
    }

    card.append(
      element("p", messages.conditions),
      renderConditionEditor(inputData, field, "visibleWhen", messages.addVisibleWhen),
      renderConditionEditor(inputData, field, "requiredWhen", messages.addRequiredWhen),
    );
    section.append(card);
  }

  return section;
}

function renderGroups(inputData: AdvancedInput): HTMLElement {
  const { schema, locale, messages, write } = inputData;
  const section = element("section");
  section.className = builderStyles.advanced;
  const heading = element("h4", messages.groups);
  heading.className = builderStyles.heading;
  section.append(heading);
  const groupList = groups(schema);

  if (groupList.length === 0) {
    section.append(element("p", messages.noGroups));
    return section;
  }

  for (const group of groupList) {
    const card = element("div");
    card.className = builderStyles.advancedCard;
    const label = localized(group.label);
    group.label = label;
    const header = element("div");
    header.className = builderStyles.header;
    header.append(element("code", `group.${stringValue(group.key)}`));
    card.append(header);
    card.append(
      textInput(label[locale] ?? "", (next) => {
        setLocalized(label, locale, next);
        write(schema);
      }),
      select(stringValue(group.mode) || "flat", GROUP_MODES, (next) => {
        group.mode = next;
        write(schema);
      }),
      select(stringValue(group.renderer) || "fieldset", GROUP_RENDERERS, (next) => {
        group.renderer = next;
        write(schema);
      }),
      select(stringValue(group.width) || "full", ["full", "half"], (next) => {
        group.width = next;
        write(schema);
      }),
      checkboxInput(group.required === true, messages.fieldRequired, (next) => {
        group.required = next;
        write(schema);
      }),
    );
    card.append(
      element("p", messages.membersHelp),
      textareaInput(
        asArray(group.members)
          .map((member) => stringValue(member))
          .join("\n"),
        (next) => {
          group.members = next
            .split("\n")
            .map((item) => item.trim())
            .filter((item) => item.length > 0);
          write(schema);
        },
      ),
    );
    section.append(card);
  }

  return section;
}

function renderOverrides(inputData: AdvancedInput): HTMLElement {
  const { schema, locale, messages, write } = inputData;
  const section = element("section");
  section.className = builderStyles.advanced;
  const heading = element("h4", messages.overrides);
  heading.className = builderStyles.heading;
  section.append(heading);
  const overrides = asRecord(schema.overrides) ?? {};
  schema.overrides = overrides;

  for (const key of ["fullName", "consent"] as const) {
    const card = element("div");
    card.className = builderStyles.advancedCard;
    const header = element("div");
    header.className = builderStyles.header;
    header.append(element("code", `system.${key}`));
    card.append(header);
    const target = asRecord(overrides[key]) ?? {};
    overrides[key] = target;
    const label = localized(target.label);
    const help = localized(target.help);
    const placeholder = localized(target.placeholder);
    target.label = label;
    target.help = help;
    target.placeholder = placeholder;
    card.append(
      textInput(label[locale] ?? "", (next) => {
        setLocalized(label, locale, next);
        write(schema);
      }),
      textInput(help[locale] ?? "", (next) => {
        setLocalized(help, locale, next);
        write(schema);
      }),
      textInput(placeholder[locale] ?? "", (next) => {
        setLocalized(placeholder, locale, next);
        write(schema);
      }),
    );
    section.append(card);
  }

  return section;
}

/** Render groups, custom fields, conditons, and system overrides. */
export function renderAdvancedPanel(inputData: AdvancedInput): void {
  const { container, messages } = inputData;
  const wrapper = element("section");
  wrapper.className = builderStyles.advanced;
  const heading = element("h3", messages.advancedBuilder);
  heading.className = builderStyles.heading;
  const help = element("p", messages.advancedBuilderHelp);
  help.className = builderStyles.help;
  wrapper.append(
    heading,
    help,
    renderCustomFields(inputData),
    renderGroups(inputData),
    renderOverrides(inputData),
  );
  container.append(wrapper);
}
