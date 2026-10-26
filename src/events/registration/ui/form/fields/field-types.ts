// @boundary client
import { type ResolvedField } from "~/events/domain/form-schema/resolve/resolve";

import { type PublicRegistrationConfig } from "../../shared/registration-types";

/** Validation message lookup keyed by field or group reference. */
export type FieldErrors = Readonly<Record<string, string>>;

/** Shared contract for a control rendered from a resolved form field. */
export interface FieldProps<TField extends ResolvedField> {
  field: TField;
  config: PublicRegistrationConfig;
  /** Conditional visibility and schema rules decide this per render. */
  required: boolean;
  /** Field-scoped validation message, when the server reported one. */
  error?: string | undefined;
}
