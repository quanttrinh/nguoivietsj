import { readControlValue } from "~/shared/client/form-controls";
import { readJsonScript } from "~/shared/client/json-script";
/* oxlint-disable eslint/max-statements, eslint/no-loop-func, eslint/no-use-before-define -- The visual builder intentionally uses mutually recursive DOM render helpers and loop closures. */
import { DEFAULT_LOCALE } from "~/shared/constants/locales";
import { isRecord } from "~/shared/utils/records";

import { renderAdvancedPanel } from "./advanced";
import { button, checkboxInput, element, selectInput, textInput } from "./dom";
import {
  asArray,
  asRecord,
  fieldLabelObject,
  nextKey,
  numberValue,
  requiredTarget,
  stringValue,
} from "./schema";
import { builderStyles } from "./styles";
import type { FieldRecord, FormBuilderMessages, JsonRecord, SectionRecord } from "./types";

export function initEngineFormBuilder(): void {
  const form = document.querySelector<HTMLFormElement>("#engine-form-editor");
  const container = document.querySelector<HTMLElement>("#engine-form-builder");
  const textarea = document.querySelector<HTMLQuiTextareaElement>("#engine-form-schema");

  if (
    form === null ||
    container === null ||
    textarea === null ||
    form.dataset.builderReady === "true"
  ) {
    return;
  }

  form.dataset.builderReady = "true";
  const messages = readJsonScript<FormBuilderMessages>("engine-form-builder-messages");

  if (messages === null) {
    return;
  }

  const locale = container.dataset.locale ?? DEFAULT_LOCALE;
  let current: JsonRecord | null = null;

  const write = (schema: JsonRecord): void => {
    current = schema;
    textarea.value = JSON.stringify(schema, null, 2);
    render();
  };

  const render = (): void => {
    container.replaceChildren();
    const heading = element("h3", messages.visualBuilder);
    heading.className = builderStyles.heading;
    const help = element("p", messages.visualBuilderHelp);
    help.className = builderStyles.help;
    container.append(heading, help);

    if (current === null) {
      const invalid = element("p", messages.visualBuilderInvalid);
      invalid.className = builderStyles.invalid;
      container.append(invalid);
      return;
    }

    const sections = asArray(current.sections)
      .map((item) => asRecord(item))
      .filter((section): section is SectionRecord => section !== null)
      .toSorted((left, right) => numberValue(left.order) - numberValue(right.order));
    const fields = asArray(current.fields)
      .map((item) => asRecord(item))
      .filter((field): field is FieldRecord => field !== null);

    const addSection = button(messages.addSection, () => {
      const schema = current;

      if (schema === null) {
        return;
      }

      const key = nextKey(schema, "section", "sections");
      const sectionsList = asArray(schema.sections);
      sectionsList.push({
        key,
        order: Math.max(0, ...sectionsList.map((item) => numberValue(asRecord(item)?.order))) + 10,
        label: { [locale]: messages.addSection },
      });
      schema.sections = sectionsList;
      write(schema);
    });

    const actions = element("div");
    actions.className = builderStyles.actions;
    actions.append(addSection);
    container.append(actions);

    for (const section of sections) {
      const card = element("div");
      card.className = builderStyles.card;

      const header = element("div");
      header.className = builderStyles.header;

      const labelInput = textInput(
        section.label?.[locale] ?? "",
        (next) => {
          const schema = current;

          if (schema !== null) {
            section.label = { ...section.label, [locale]: next };
            write(schema);
          }
        },
        messages.fieldLabel,
      );
      labelInput.className = builderStyles.sectionInput;

      header.append(
        labelInput,
        button(messages.moveUp, () => {
          moveSection(section, -1);
        }),
        button(messages.moveDown, () => {
          moveSection(section, 1);
        }),
        button(messages.addTextField, () => {
          addTextField(section);
        }),
      );
      card.append(header);

      const sectionFields = fields
        .filter((field) => field.section === section.key)
        .toSorted((left, right) => numberValue(left.order) - numberValue(right.order));

      for (const field of sectionFields) {
        const row = element("div");
        row.className = builderStyles.row;

        const label = fieldLabelObject(current, field.ref);
        const required = requiredTarget(current, field.ref);
        const refLabel = element("code", field.ref);
        refLabel.className = builderStyles.ref;
        row.append(refLabel);

        if (label !== null) {
          row.append(
            textInput(
              label[locale] ?? "",
              (next) => {
                if (current !== null) {
                  label[locale] = next;
                  write(current);
                }
              },
              messages.fieldLabel,
            ),
          );
        }

        row.append(
          selectInput(
            stringValue(field.width) || "full",
            [
              { value: "full", label: messages.widthFull },
              { value: "half", label: messages.widthHalf },
            ],
            (next) => {
              if (current !== null) {
                field.width = next;
                write(current);
              }
            },
            messages.fieldWidth,
          ),
        );

        if (required !== null) {
          row.append(
            checkboxInput(required.required === true, messages.fieldRequired, (next) => {
              if (current !== null) {
                required.required = next;
                write(current);
              }
            }),
          );
        }

        row.append(
          button(messages.moveUp, () => {
            moveField(section.key, field, -1);
          }),
          button(messages.moveDown, () => {
            moveField(section.key, field, 1);
          }),
        );
        card.append(row);
      }

      container.append(card);
    }

    renderAdvancedPanel({ container, schema: current, locale, messages, write });
  };

  const moveSection = (section: SectionRecord, direction: -1 | 1): void => {
    const schema = current;

    if (schema === null) {
      return;
    }

    const list = asArray(schema.sections)
      .map((item) => asRecord(item))
      .filter((item): item is SectionRecord => item !== null)
      .toSorted((left, right) => numberValue(left.order) - numberValue(right.order));
    const index = list.findIndex((item) => item.key === section.key);
    const other = list[index + direction];

    if (other === undefined) {
      return;
    }

    const order = section.order;
    section.order = other.order;
    other.order = order;
    write(schema);
  };

  const moveField = (sectionKey: string, field: FieldRecord, direction: -1 | 1): void => {
    const schema = current;

    if (schema === null) {
      return;
    }

    const list = asArray(schema.fields)
      .map((item) => asRecord(item))
      .filter((item): item is FieldRecord => item !== null)
      .filter((item) => item.section === sectionKey)
      .toSorted((left, right) => numberValue(left.order) - numberValue(right.order));
    const index = list.findIndex((item) => item.ref === field.ref);
    const other = list[index + direction];

    if (other === undefined) {
      return;
    }

    const order = field.order;
    field.order = other.order;
    other.order = order;
    write(schema);
  };

  const addTextField = (section: SectionRecord): void => {
    const schema = current;

    if (schema === null) {
      return;
    }

    const key = nextKey(schema, "field", "customFields");
    const customFields = asArray(schema.customFields);
    customFields.push({
      key,
      type: "text",
      required: false,
      label: { [locale]: messages.addTextField },
    });
    schema.customFields = customFields;

    const fields = asArray(schema.fields);
    const sectionFields = fields
      .map((item) => asRecord(item))
      .filter((item) => item?.section === section.key);
    fields.push({
      ref: `custom.${key}`,
      section: section.key,
      order: Math.max(0, ...sectionFields.map((item) => numberValue(item?.order))) + 10,
      width: "full",
    });
    schema.fields = fields;
    write(schema);
  };

  const read = (): void => {
    try {
      const parsed = JSON.parse(readControlValue(textarea)) as unknown;
      current = isRecord(parsed) ? parsed : null;
    } catch {
      current = null;
    }

    render();
  };

  textarea.addEventListener("valuechange", read);
  read();
}
