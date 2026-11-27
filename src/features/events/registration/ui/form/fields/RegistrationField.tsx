// @boundary client
import type { JSX } from "preact";

import { FORM_FIELD_KIND } from "~/features/events/domain/form-schema/constants";
import { ticketFieldName } from "~/features/events/domain/form-schema/refs";
import type { ResolvedField } from "~/features/events/domain/form-schema/resolve/resolve";
import type { FormStateVisibility } from "~/features/events/domain/form-schema/state";
import type { EngineClientConfig } from "~/features/events/domain/form-schema/types";

import type { PublicRegistrationConfig } from "../../shared/registration-types";
import type { RegistrationValues } from "../registration-form-state";
import { ConfirmationField } from "./ConfirmationField";
import { ConsentField } from "./ConsentField";
import { ContactField } from "./ContactField";
import { CustomField } from "./CustomField";
import type { FieldErrors } from "./field-types";
import { FieldShell } from "./FieldPrimitives";
import { FullNameField } from "./FullNameField";
import { GroupField } from "./GroupField";
import { MailField } from "./MailField";
import { TicketField } from "./TicketField";

interface RegistrationFieldProps {
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
  { field, config, client, values, state, errors, initialized, required }: RegistrationFieldProps,
  error: string | undefined,
): JSX.Element | null {
  switch (field.kind) {
    case FORM_FIELD_KIND.fullName: {
      return <FullNameField field={field} config={config} error={error} />;
    }
    case FORM_FIELD_KIND.consent: {
      return <ConsentField field={field} config={config} error={error} />;
    }
    case FORM_FIELD_KIND.contact: {
      return <ContactField field={field} config={config} required={required} error={error} />;
    }
    case FORM_FIELD_KIND.mail: {
      return <MailField field={field} config={config} required={required} errors={errors} />;
    }
    case FORM_FIELD_KIND.confirmation: {
      return <ConfirmationField field={field} config={config} error={error} />;
    }
    case FORM_FIELD_KIND.ticket: {
      return (
        <TicketField
          field={field}
          config={config}
          required={required}
          error={error ?? errors[ticketFieldName(field.ticket.key)]}
        />
      );
    }
    case FORM_FIELD_KIND.custom: {
      return <CustomField field={field} config={config} required={required} error={error} />;
    }
    case FORM_FIELD_KIND.group: {
      return (
        <GroupField
          field={field}
          config={config}
          client={client}
          values={values}
          state={state}
          errors={errors}
          initialized={initialized}
        />
      );
    }
    default: {
      return null;
    }
  }
}

/** Routes a resolved field to its dedicated control component. */
export function RegistrationField({
  field,
  config,
  client,
  values,
  state,
  errors,
  initialized,
  visible,
  required,
}: RegistrationFieldProps): JSX.Element {
  const error = errors[field.ref];

  return (
    <FieldShell fieldRef={field.ref} kind={field.kind} width={field.width} visible={visible}>
      {registrationControl(
        { field, config, client, values, state, errors, initialized, visible, required },
        error,
      )}
    </FieldShell>
  );
}
