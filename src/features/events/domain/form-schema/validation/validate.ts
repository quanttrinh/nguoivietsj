// @boundary shared
import { type } from "arktype";

import { validateConditions } from "~/features/events/domain/form-schema/conditions/conditions";
import { FormSchemaIssues } from "~/features/events/domain/form-schema/issues";
import { validatePlacement } from "~/features/events/domain/form-schema/resolve/placement";
import { formSchemaSchema } from "~/features/events/domain/form-schema/schema/schema";
import type {
  FormSchema,
  FormSchemaValidationOptions,
  FormSchemaValidationResult,
} from "~/features/events/domain/form-schema/types";
import {
  validateContacts,
  validateCustomFields,
  validateGroups,
  validateSections,
} from "~/features/events/domain/form-schema/validation/structure";

function issuePath(path: readonly (string | number | symbol)[]) {
  const normalized = path.map(String).join(".");
  return normalized.length > 0 ? normalized : "schema";
}

function parseFormSchema(input: unknown, issues: FormSchemaIssues): FormSchema | null {
  const result = formSchemaSchema(input);

  if (!(result instanceof type.errors)) {
    return result;
  }

  for (const error of result) {
    issues.error(issuePath(error.path), "invalid_schema", error.message);
  }

  return null;
}

/**
 * Validate a form schema before it is persisted.
 *
 * Drafts may be structurally incomplete, but malformed or contradictory
 * schemas are rejected. Published schemas must be fully placed and renderable.
 */
export function validateFormSchema(
  input: unknown,
  options: FormSchemaValidationOptions,
): FormSchemaValidationResult {
  const issues = new FormSchemaIssues();

  const schema = parseFormSchema(input, issues);

  if (schema === null) {
    return { errors: issues.errors, warnings: issues.warnings, schema: null };
  }

  validateSections(schema, issues);
  validateContacts(schema.contacts, options.mode, issues);
  validateCustomFields(schema, issues);
  validateGroups(schema, options.mode, issues);
  validatePlacement(schema, options, issues);
  validateConditions(schema, options, issues);

  return { errors: issues.errors, warnings: issues.warnings, schema };
}
