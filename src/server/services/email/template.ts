// @boundary server
import { escapeAttribute } from "entities";

export type EmailTemplateVariables = Record<string, string | number | boolean>;

export interface EmailTemplateDefinition {
  html: string;
  text: string;
  subject: (variables: EmailTemplateVariables) => string;
}

const PLACEHOLDER = /\{\{(?<key>[\w-]+)\}\}/gu;

/** Resolve one placeholder, returning an empty string for missing values. */
export function templateValue(variables: EmailTemplateVariables, key: string): string {
  const value = variables[key];
  return value === undefined ? "" : String(value);
}

/** Render an HTML or plain-text template body with escaped HTML values. */
export function renderEmailTemplate(
  template: EmailTemplateDefinition,
  variables: EmailTemplateVariables,
  format: "html" | "text",
): string {
  const source = template[format];

  return source.replaceAll(PLACEHOLDER, (_match, key: string) => {
    const value = templateValue(variables, key);
    return format === "html" ? escapeAttribute(value) : value;
  });
}

/** Resolve the subject line for a template. */
export function emailTemplateSubject(
  template: EmailTemplateDefinition,
  variables: EmailTemplateVariables,
): string {
  return template.subject(variables);
}
