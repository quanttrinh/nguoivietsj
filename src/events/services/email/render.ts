// @boundary server
import paymentConfirmedHtml from "~/events/services/email/templates/payment-confirmed.html?raw";
import paymentConfirmedText from "~/events/services/email/templates/payment-confirmed.txt?raw";
import registrationReceivedHtml from "~/events/services/email/templates/registration-received.html?raw";
import registrationReceivedText from "~/events/services/email/templates/registration-received.txt?raw";
import statusOtpHtml from "~/events/services/email/templates/status-otp.html?raw";
import statusOtpText from "~/events/services/email/templates/status-otp.txt?raw";
import {
  emailTemplateSubject,
  renderEmailTemplate as renderTemplate,
  templateValue,
  type EmailTemplateDefinition,
  type EmailTemplateVariables,
} from "~/server/services/email/template";

export type EmailTemplateName = "registrationReceived" | "paymentConfirmed" | "statusOtp";

const EMAIL_TEMPLATES: Record<EmailTemplateName, EmailTemplateDefinition> = {
  registrationReceived: {
    html: registrationReceivedHtml,
    text: registrationReceivedText,
    subject: (variables) => `Registration received: ${templateValue(variables, "event_title")}`,
  },
  paymentConfirmed: {
    html: paymentConfirmedHtml,
    text: paymentConfirmedText,
    subject: (variables) => `Payment confirmed: ${templateValue(variables, "event_title")}`,
  },
  statusOtp: {
    html: statusOtpHtml,
    text: statusOtpText,
    subject: (variables) => `Your verification code: ${templateValue(variables, "code")}`,
  },
};

export function renderEmailTemplate(
  template: EmailTemplateName,
  variables: EmailTemplateVariables,
  format: "html" | "text",
): string {
  return renderTemplate(EMAIL_TEMPLATES[template], variables, format);
}

export function emailSubject(
  template: EmailTemplateName,
  variables: EmailTemplateVariables,
): string {
  return emailTemplateSubject(EMAIL_TEMPLATES[template], variables);
}
