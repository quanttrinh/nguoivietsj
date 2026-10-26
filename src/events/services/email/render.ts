// @boundary server
import { escapeAttribute } from "entities";

import paymentConfirmedHtml from "~/events/services/email/templates/payment-confirmed.html?raw";
import paymentConfirmedText from "~/events/services/email/templates/payment-confirmed.txt?raw";
import registrationReceivedHtml from "~/events/services/email/templates/registration-received.html?raw";
import registrationReceivedText from "~/events/services/email/templates/registration-received.txt?raw";
import statusOtpHtml from "~/events/services/email/templates/status-otp.html?raw";
import statusOtpText from "~/events/services/email/templates/status-otp.txt?raw";

export type EmailTemplateName = "registrationReceived" | "paymentConfirmed" | "statusOtp";

export type EmailTemplateVariables = Record<string, string | number | boolean>;

interface EmailTemplateDefinition {
  html: string;
  text: string;
  subject: (variables: EmailTemplateVariables) => string;
}

const PLACEHOLDER = /\{\{(?<key>[\w-]+)\}\}/gu;

function valueFor(variables: EmailTemplateVariables, key: string): string {
  const value = variables[key];
  return value === undefined ? "" : String(value);
}

function render(source: string, variables: EmailTemplateVariables, html: boolean): string {
  return source.replaceAll(PLACEHOLDER, (_match, key: string) => {
    const value = valueFor(variables, key);
    return html ? escapeAttribute(value) : value;
  });
}

const EMAIL_TEMPLATES: Record<EmailTemplateName, EmailTemplateDefinition> = {
  registrationReceived: {
    html: registrationReceivedHtml,
    text: registrationReceivedText,
    subject: (variables) => `Registration received: ${valueFor(variables, "event_title")}`,
  },
  paymentConfirmed: {
    html: paymentConfirmedHtml,
    text: paymentConfirmedText,
    subject: (variables) => `Payment confirmed: ${valueFor(variables, "event_title")}`,
  },
  statusOtp: {
    html: statusOtpHtml,
    text: statusOtpText,
    subject: (variables) => `Your verification code: ${valueFor(variables, "code")}`,
  },
};

export function renderEmailTemplate(
  template: EmailTemplateName,
  variables: EmailTemplateVariables,
  format: "html" | "text",
): string {
  return render(EMAIL_TEMPLATES[template][format], variables, format === "html");
}

export function emailSubject(
  template: EmailTemplateName,
  variables: EmailTemplateVariables,
): string {
  return EMAIL_TEMPLATES[template].subject(variables);
}
