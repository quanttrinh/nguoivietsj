// @boundary client
import { type JSX } from "preact";

import { FORM_FIELD_KIND, ticketFieldName } from "~/events/domain/form-schema/constants";
import { type ResolvedField } from "~/events/domain/form-schema/resolve/resolve";
import { type FormStateVisibility } from "~/events/domain/form-schema/state";
import { type EngineClientConfig } from "~/events/domain/form-schema/types";

import { type PublicRegistrationConfig } from "../../shared/registration-types";
import { type RegistrationValues } from "../registration-form-state";
import { ConfirmationField } from "./ConfirmationField";
import { ConsentField } from "./ConsentField";
import { ContactField } from "./ContactField";
import { CustomField } from "./CustomField";
import { type FieldErrors } from "./field-types";
import { FieldShell } from "./FieldPrimitives";
import { FullNameField } from "./FullNameField";
import { GroupField } from "./GroupField";
import { MailField } from "./MailField";
import { TicketField } from "./TicketField";

export interface RegistrationFieldProps {
  field: ResolvedField;
  config: PublicRegistrationConfig;
  client: EngineClientConfig;
  values: RegistrationValues;
  state: FormStateVisibility;
  errors: FieldErrors;
  initialized: boolean;
  visible: boolean;
  required: boolean;
}

function registrationControl(
  props: RegistrationFieldProps,
  error: string | undefined,
): JSX.Element | null {
  const field = props.field;

  switch (field.kind) {
    case FORM_FIELD_KIND.fullName: {
      return <FullNameField field={field} config={props.config} error={error} />;
    }
    case FORM_FIELD_KIND.consent: {
      return <ConsentField field={field} config={props.config} error={error} />;
    }
    case FORM_FIELD_KIND.contact: {
      return (
        <ContactField field={field} config={props.config} required={props.required} error={error} />
      );
    }
    case FORM_FIELD_KIND.mail: {
      return (
        <MailField
          field={field}
          config={props.config}
          required={props.required}
          errors={props.errors}
        />
      );
    }
    case FORM_FIELD_KIND.confirmation: {
      return <ConfirmationField field={field} config={props.config} error={error} />;
    }
    case FORM_FIELD_KIND.ticket: {
      return (
        <TicketField
          field={field}
          config={props.config}
          required={props.required}
          error={error ?? props.errors[ticketFieldName(field.ticket.key)]}
        />
      );
    }
    case FORM_FIELD_KIND.custom: {
      return (
        <CustomField field={field} config={props.config} required={props.required} error={error} />
      );
    }
    case FORM_FIELD_KIND.group: {
      return (
        <GroupField
          field={field}
          config={props.config}
          client={props.client}
          values={props.values}
          state={props.state}
          errors={props.errors}
          initialized={props.initialized}
        />
      );
    }
    default: {
      return null;
    }
  }
}

/** Routes a resolved field to its dedicated control component. */
export function RegistrationField(props: RegistrationFieldProps): JSX.Element {
  const error = props.errors[props.field.ref];

  return (
    <FieldShell
      fieldRef={props.field.ref}
      kind={props.field.kind}
      width={props.field.width}
      visible={props.visible}
    >
      {registrationControl(props, error)}
    </FieldShell>
  );
}
