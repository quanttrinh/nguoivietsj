import { type } from "arktype";
import { describe, expect, test } from "vitest";

import { REGISTRATION_VALIDATION_CODE } from "~/features/events/domain/form-schema/constants";
import { formSchemaSchema } from "~/features/events/domain/form-schema/schema/schema";
import type { FormSchema } from "~/features/events/domain/form-schema/types";
import { validateRegistrationForm } from "~/features/events/domain/form-schema/validation/validate-registration";
import type { RegistrationInput } from "~/features/events/server/schemas/registration";
import { seedFormSchemas } from "~/platform/jobs/backfills/seed";

const baseSchema = seedFormSchemas()[0]?.schema;

function schemaWithField(field: Record<string, unknown>): FormSchema {
  expect(baseSchema).toBeDefined();
  const parsed = formSchemaSchema({ ...baseSchema, customFields: [field] });

  if (parsed instanceof type.errors) {
    throw new TypeError(parsed.summary);
  }

  return parsed;
}

function inputWithAnswer(value: unknown): RegistrationInput {
  return {
    fullName: "Test User",
    contacts: [
      {
        kind: "email",
        email: "test@example.ca",
        label: null,
        isPrimary: false,
        isConfirmation: false,
        value: {},
      },
    ],
    tickets: [{ key: "general", quantity: 1 }],
    consent: true,
    formVersion: 1,
    answers: { note: value },
    metadata: {},
  };
}

function customIssue(field: Record<string, unknown>, value: unknown) {
  return validateRegistrationForm(schemaWithField(field), inputWithAnswer(value)).issues.find(
    (issue) => issue.ref === "custom.note",
  )?.code;
}

const textField = { key: "note", type: "text", label: { en: "Note" } };

describe("custom answer validation", () => {
  test("accepts a valid text answer", () => {
    expect(customIssue(textField, "hello")).toBeUndefined();
  });

  test("reports required for a missing required answer", () => {
    expect(customIssue({ ...textField, required: true }, undefined)).toBe(
      REGISTRATION_VALIDATION_CODE.required,
    );
  });

  test("reports required for an empty required text answer", () => {
    expect(customIssue({ ...textField, required: true }, "")).toBe(
      REGISTRATION_VALIDATION_CODE.required,
    );
  });

  test("reports invalidValue when text exceeds maxLength", () => {
    expect(customIssue({ ...textField, maxLength: 3 }, "too long")).toBe(
      REGISTRATION_VALIDATION_CODE.invalidValue,
    );
  });

  test("reports invalidValue when a text answer is not a string", () => {
    expect(customIssue(textField, 42)).toBe(REGISTRATION_VALIDATION_CODE.invalidValue);
  });

  test("respects numeric bounds and rejects non-finite numbers", () => {
    const numberField = { key: "note", type: "number", label: { en: "Note" }, min: 1, max: 5 };

    expect(customIssue(numberField, 3)).toBeUndefined();
    expect(customIssue(numberField, 9)).toBe(REGISTRATION_VALIDATION_CODE.invalidNumber);
    expect(customIssue(numberField, Number.POSITIVE_INFINITY)).toBe(
      REGISTRATION_VALIDATION_CODE.invalidNumber,
    );
  });

  test("reports invalidOption for a value outside the options", () => {
    const selectField = {
      key: "note",
      type: "select",
      label: { en: "Note" },
      options: [{ value: "yes", label: { en: "Yes" } }],
    };

    expect(customIssue(selectField, "yes")).toBeUndefined();
    expect(customIssue(selectField, "no")).toBe(REGISTRATION_VALIDATION_CODE.invalidOption);
  });

  test("requires a true checkbox when marked required", () => {
    const checkboxField = { key: "note", type: "checkbox", label: { en: "Note" }, required: true };

    expect(customIssue(checkboxField, true)).toBeUndefined();
    expect(customIssue(checkboxField, false)).toBe(REGISTRATION_VALIDATION_CODE.required);
  });
});
