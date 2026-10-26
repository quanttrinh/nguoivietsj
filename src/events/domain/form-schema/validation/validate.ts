import { Value } from "@sinclair/typebox/value";

import { validateConditions } from "~/events/domain/form-schema/conditions/conditions";
import { FormSchemaIssues } from "~/events/domain/form-schema/issues";
import { validatePlacement } from "~/events/domain/form-schema/resolve/placement";
import { formSchemaSchema } from "~/events/domain/form-schema/schema/schema";
import type {
  FormSchema,
  FormSchemaValidationOptions,
  FormSchemaValidationResult,
} from "~/events/domain/form-schema/types";
import {
  validateContacts,
  validateCustomFields,
  validateGroups,
  validateSections,
} from "~/events/domain/form-schema/validation/structure";
import { LEADING_SLASH_REGEX } from "~/shared/constants/patterns";

function issuePath(path: string): string {
  const normalized = path.replace(LEADING_SLASH_REGEX, "").replaceAll("/", ".");
  return normalized.length > 0 ? normalized : "schema";
}

function shapeIssues(input: unknown, issues: FormSchemaIssues): boolean {
  if (Value.Check(formSchemaSchema, input)) {
    return true;
  }

  for (const error of Value.Errors(formSchemaSchema, input)) {
    issues.error(issuePath(error.path), "invalid_schema", error.message);
  }

  return false;
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

  if (!shapeIssues(input, issues)) {
    return { errors: issues.errors, warnings: issues.warnings, schema: null };
  }

  const schema = input as FormSchema;

  validateSections(schema, issues);
  validateContacts(schema.contacts, options.mode, issues);
  validateCustomFields(schema, issues);
  validateGroups(schema, options.mode, issues);
  validatePlacement(schema, options, issues);
  validateConditions(schema, options, issues);

  return { errors: issues.errors, warnings: issues.warnings, schema };
}
