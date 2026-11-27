// @boundary client
import type { JSX } from "preact";

import {
  FORM_GROUP_MODE,
  FORM_GROUP_RENDERER,
} from "~/features/events/domain/form-schema/constants";
import { groupRef } from "~/features/events/domain/form-schema/refs";
import type {
  ResolvedGroup,
  ResolvedGroupField,
} from "~/features/events/domain/form-schema/resolve/resolve";
import type { FormStateVisibility } from "~/features/events/domain/form-schema/state";
import type { EngineClientConfig } from "~/features/events/domain/form-schema/types";

import { styles } from "../../shared/registration-styles";
import type { PublicRegistrationConfig } from "../../shared/registration-types";
import {
  fieldRequired,
  fieldVisible,
  readGroupValue,
  type RegistrationFieldContext,
  type RegistrationValues,
} from "../registration-form-state";
import type { FieldErrors } from "./field-types";
import { GroupMember } from "./GroupMember";

interface GroupFieldProps {
  field: ResolvedGroupField;
  config: PublicRegistrationConfig;
  client: EngineClientConfig;
  values: RegistrationValues;
  state: FormStateVisibility;
  errors: FieldErrors;
  initialized: boolean;
}

function initialSelection(group: ResolvedGroup) {
  return group.default ?? (group.required ? (group.members[0]?.ref ?? "") : "");
}

function usesRadioRenderer(group: ResolvedGroup) {
  return (
    group.renderer === FORM_GROUP_RENDERER.radio || group.renderer === FORM_GROUP_RENDERER.tabs
  );
}

export function GroupField({
  field,
  config,
  client,
  values,
  state,
  errors,
  initialized,
}: GroupFieldProps): JSX.Element {
  const { group } = field;
  const context: RegistrationFieldContext = {
    values,
    config: client,
    state,
  };
  const initialSelected = initialSelection(group);
  const selected = initialized ? readGroupValue(values, group.key) : initialSelected;
  const error = errors[groupRef(group.key)];
  const radio = usesRadioRenderer(group);

  return (
    <fieldset
      class={styles.group}
      data-group-key={group.key}
      data-group-mode={group.mode}
      data-group-renderer={group.renderer}
    >
      <legend class={styles.legend}>
        {group.label}
        {group.required ? (
          <span class={styles.error} aria-hidden="true">
            *
          </span>
        ) : null}
      </legend>

      {radio ? (
        <div class={styles.groupOptions}>
          <qui-radio-group
            name={`group.${group.key}`}
            required={group.required}
            invalid={error !== undefined}
            defaultValue={initialSelected}
          >
            {group.mode === FORM_GROUP_MODE.oneOf && !group.required ? (
              <qui-radio value="">{config.labels.engineRegistration.groups.none}</qui-radio>
            ) : null}
            {group.options.map((option) => (
              <qui-radio key={option.ref} value={option.ref}>
                {option.label}
              </qui-radio>
            ))}
          </qui-radio-group>

          <div class={styles.panels}>
            {group.members.map((item) => {
              const visible = selected === item.ref && fieldVisible(item.ref, context);

              return (
                <div
                  key={item.ref}
                  class={styles.panelItem}
                  data-group-member={item.ref}
                  hidden={!visible}
                  aria-hidden={!visible}
                >
                  <GroupMember
                    member={item}
                    config={config}
                    required={fieldRequired(item.ref, context)}
                    error={errors[item.ref]}
                    errors={errors}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div class={styles.fields}>
          {group.members.map((item) => {
            const visible = fieldVisible(item.ref, context);

            return (
              <div
                key={item.ref}
                class={styles.panelItem}
                data-group-member={item.ref}
                hidden={!visible}
                aria-hidden={!visible}
              >
                <GroupMember
                  member={item}
                  config={config}
                  required={fieldRequired(item.ref, context)}
                  error={errors[item.ref]}
                  errors={errors}
                />
              </div>
            );
          })}
        </div>
      )}

      <p class={styles.error} data-group-error hidden={error === undefined}>
        {error}
      </p>
    </fieldset>
  );
}
