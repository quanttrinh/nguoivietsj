// @boundary shared
import { type } from "arktype";

import {
  resolveRegistrationForm,
  type ResolvedRegistrationForm,
} from "~/events/domain/form-schema/resolve/resolve";
import { formSchemaSchema } from "~/events/domain/form-schema/schema/schema";
import type { EventDetail, FormVersionRecord } from "~/events/domain/types";

/** Resolve a stored form version for display, tolerating a corrupt stored schema. */
export function resolvePublishedForm(
  event: EventDetail,
  formVersion: FormVersionRecord,
  locale: string,
): ResolvedRegistrationForm | null {
  const schema = formSchemaSchema(formVersion.schema);

  if (schema instanceof type.errors) {
    return null;
  }

  return resolveRegistrationForm({
    event,
    schema,
    formVersion: formVersion.version,
    locale,
  });
}
