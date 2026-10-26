import type { JSX } from "preact";

import { FORM_FIELD_KIND, FORM_GROUP_RENDERER } from "~/events/domain/form-schema/constants";
import type {
  ResolvedField,
  ResolvedGroupMember,
  ResolvedRegistrationForm,
} from "~/events/domain/form-schema/resolve/resolve";

import { styles } from "../registration-styles";
import type { PublicRegistrationConfig } from "../registration-types";
import { ContactField, MailField } from "./contact-fields";
import { CustomField } from "./custom-fields";

export function GroupMember(props: {
  member: ResolvedGroupMember;
  config: PublicRegistrationConfig;
}): JSX.Element | null {
  if (props.member.kind === FORM_FIELD_KIND.contact) {
    return <ContactField field={props.member} config={props.config} />;
  }

  if (props.member.kind === FORM_FIELD_KIND.mail) {
    return <MailField field={props.member} config={props.config} />;
  }

  if (props.member.kind === FORM_FIELD_KIND.custom) {
    return <CustomField field={props.member} config={props.config} />;
  }

  return null;
}
export function GroupField(props: {
  field: Extract<
    ResolvedField,
    {
      kind: typeof FORM_FIELD_KIND.group;
    }
  >;
  config: PublicRegistrationConfig;
}): JSX.Element {
  const group = (): ResolvedRegistrationForm["groups"][number] => props.field.group;
  const selected = (): string =>
    group().default ?? (group().required ? (group().members[0]?.ref ?? "") : "");
  return (
    <fieldset
      class={styles.group}
      data-group-key={group().key}
      data-group-mode={group().mode}
      data-group-renderer={group().renderer}
    >
      <legend class={styles.legend}>
        {group().label}
        {group().required ? (
          <span class={styles.error} aria-hidden="true">
            *
          </span>
        ) : null}
      </legend>

      {group().renderer === FORM_GROUP_RENDERER.radio ||
      group().renderer === FORM_GROUP_RENDERER.tabs ? (
        <div class={styles.groupOptions}>
          <qui-radio-group
            name={`group.${group().key}`}
            required={group().required || undefined}
            ref={(element: HTMLElement | null) => {
              if (element !== null) {
                (
                  element as HTMLElement & {
                    value: string;
                  }
                ).value = selected();
              }
            }}
          >
            {group().mode === "oneOf" && !group().required ? (
              <qui-radio value="">{props.config.fields.groupsNone}</qui-radio>
            ) : null}
            {group().options.map((option) => (
              <qui-radio key={option.ref} value={option.ref}>
                {option.label}
              </qui-radio>
            ))}
          </qui-radio-group>

          <div class={styles.panels}>
            {group().members.map((member) => (
              <div
                key={member.ref}
                class={styles.panelItem}
                data-group-member={member.ref}
                hidden={selected() !== member.ref}
              >
                <GroupMember member={member} config={props.config} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div class={styles.fields}>
          {group().members.map((member) => (
            <div key={member.ref} class={styles.panelItem} data-group-member={member.ref}>
              <GroupMember member={member} config={props.config} />
            </div>
          ))}
        </div>
      )}

      <p class={styles.error} data-group-error hidden />
    </fieldset>
  );
}
