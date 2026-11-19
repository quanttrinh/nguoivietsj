import { describe, expect, test } from "vitest";

import {
  emailTemplateSubject,
  renderEmailTemplate,
  templateValue,
  type EmailTemplateDefinition,
} from "../../../../../src/server/services/email/template";

const template: EmailTemplateDefinition = {
  html: "<p>Hello {{name}}! {{missing}}</p>",
  text: "Hello {{name}}! {{missing}}",
  subject: (variables) => `Welcome ${templateValue(variables, "name")}`,
};

describe("templateValue", () => {
  test("stringifies present values", () => {
    expect(templateValue({ count: 3, active: true, name: "Ana" }, "count")).toBe("3");
    expect(templateValue({ count: 3, active: true, name: "Ana" }, "active")).toBe("true");
    expect(templateValue({ count: 3, active: true, name: "Ana" }, "name")).toBe("Ana");
  });

  test("returns an empty string for missing values", () => {
    expect(templateValue({}, "missing")).toBe("");
  });
});

describe("renderEmailTemplate", () => {
  test("escapes interpolated HTML values", () => {
    expect(renderEmailTemplate(template, { name: '<b>&"' }, "html")).toBe(
      "<p>Hello &lt;b&gt;&amp;&quot;! </p>",
    );
  });

  test("keeps plain-text values unescaped and replaces missing values with empty text", () => {
    expect(renderEmailTemplate(template, { name: '<b>&"' }, "text")).toBe('Hello <b>&"! ');
  });
});

describe("emailTemplateSubject", () => {
  test("delegates to the template's subject resolver", () => {
    expect(emailTemplateSubject(template, { name: "Ana" })).toBe("Welcome Ana");
  });
});
