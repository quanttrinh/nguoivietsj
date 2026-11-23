// @boundary client
import type { JSX } from "preact";

import { FORM_FIELD_KIND } from "~/events/domain/form-schema/constants";
import type { ResolvedGroupMember } from "~/events/domain/form-schema/resolve/resolve";

import type { PublicRegistrationConfig } from "../../shared/registration-types";
import { ContactField } from "./ContactField";
import { CustomField } from "./CustomField";
import type { FieldErrors } from "./field-types";
import { MailField } from "./MailField";

interface GroupMemberProps {
  member: ResolvedGroupMember;
  config: PublicRegistrationConfig;
  required: boolean;
  error?: string | undefined;
  errors: FieldErrors;
}

export function GroupMember({
  member,
  config,
  required,
  error,
  errors,
}: GroupMemberProps): JSX.Element {
  if (member.kind === FORM_FIELD_KIND.contact) {
    return <ContactField field={member} config={config} required={required} error={error} />;
  }

  if (member.kind === FORM_FIELD_KIND.mail) {
    return <MailField field={member} config={config} required={required} errors={errors} />;
  }

  return <CustomField field={member} config={config} required={required} error={error} />;
}
