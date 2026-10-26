// @boundary client
import { type JSX } from "preact";

import { FORM_FIELD_KIND } from "~/events/domain/form-schema/constants";
import { type ResolvedGroupMember } from "~/events/domain/form-schema/resolve/resolve";

import { type PublicRegistrationConfig } from "../../shared/registration-types";
import { ContactField } from "./ContactField";
import { CustomField } from "./CustomField";
import { type FieldErrors } from "./field-types";
import { MailField } from "./MailField";

export interface GroupMemberProps {
  member: ResolvedGroupMember;
  config: PublicRegistrationConfig;
  required: boolean;
  error?: string | undefined;
  errors: FieldErrors;
}

export function GroupMember(props: GroupMemberProps): JSX.Element {
  if (props.member.kind === FORM_FIELD_KIND.contact) {
    return (
      <ContactField
        field={props.member}
        config={props.config}
        required={props.required}
        error={props.error}
      />
    );
  }

  if (props.member.kind === FORM_FIELD_KIND.mail) {
    return (
      <MailField
        field={props.member}
        config={props.config}
        required={props.required}
        errors={props.errors}
      />
    );
  }

  return (
    <CustomField
      field={props.member}
      config={props.config}
      required={props.required}
      error={props.error}
    />
  );
}
