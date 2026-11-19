import { expect, test } from "vitest";

import { emailSubject, renderEmailTemplate } from "../../../../../src/events/services/email/render";
import { emailTransport } from "../../../../../src/server/services/email";
import { toBase64, toBase64Url } from "../../../../../src/server/services/email/encoding";
import {
  buildGmailMimeMessage,
  gmailTransport,
} from "../../../../../src/server/services/email/gmail";
import { mailtrapTransport } from "../../../../../src/server/services/email/mailtrap";

const variables = {
  full_name: 'Nguyễn <Văn> & "A"',
  event_title: "Summer Picnic 2027",
  registration_id: "0199e2c0-7a1f-7000-8000-123456789abc",
  ticket_summary: "2 × Adult",
  amount_due: "$50.00",
  payment_instructions: "e-Transfer to events@nguoivietsj.ca",
  status_url: "https://nguoivietsj.ca/en/events/status/view?token=abc&locale=en",
  amount: "$25.00",
  method: "e-Transfer",
  qr_content_id: "checkin-qr",
  code: "123456",
  expires_minutes: "10",
};

test("HTML templates escape interpolated values", () => {
  const html = renderEmailTemplate("registrationReceived", variables, "html");

  expect(html).toContain("Nguyễn &lt;Văn&gt; &amp; &quot;A&quot;");
  expect(html).not.toContain("<Văn>");
  expect(html).toContain("https://nguoivietsj.ca/en/events/status/view?token=abc&amp;locale=en");
});

test("text templates keep values unescaped", () => {
  const text = renderEmailTemplate("registrationReceived", variables, "text");

  expect(text).toContain('Nguyễn <Văn> & "A"');
  expect(text).not.toContain("&lt;Văn&gt;");
});

test("subjects use the event and OTP values", () => {
  expect(emailSubject("registrationReceived", variables)).toBe(
    "Registration received: Summer Picnic 2027",
  );
  expect(emailSubject("statusOtp", variables)).toBe("Your verification code: 123456");
});

test("Gmail MIME includes headers, alternative bodies, and inline attachments", () => {
  const mime = buildGmailMimeMessage({
    fromEmail: "events@nguoivietsj.ca",
    fromName: "Người Việt SJ Events",
    to: "registrant@example.com",
    subject: "Payment confirmed: Summer Picnic 2027",
    html: renderEmailTemplate("paymentConfirmed", variables, "html"),
    text: renderEmailTemplate("paymentConfirmed", variables, "text"),
    attachments: [
      {
        content: toBase64(new Uint8Array([71, 73, 70])),
        filename: "checkin-qr.gif",
        type: "image/gif",
        disposition: "inline",
        content_id: "checkin-qr",
      },
    ],
  });

  expect(mime).toContain("From: =?UTF-8?B?");
  expect(mime).toContain("To: registrant@example.com");
  expect(mime).toContain("Content-Type: multipart/related");
  expect(mime).toContain("Content-Type: multipart/alternative");
  expect(mime).toContain("Content-ID: <checkin-qr>");
  expect(mime).toContain('filename="checkin-qr.gif"');
  expect(renderEmailTemplate("paymentConfirmed", variables, "html")).toContain("cid:checkin-qr");
});

test("base64url encoding has no padding or URL-unsafe characters", () => {
  const encoded = toBase64Url(new TextEncoder().encode('Nguyễn <Văn> & "A" ?'));

  expect(encoded).not.toMatch(/[+/=]/u);
});

test("both email providers implement the shared transport interface", () => {
  expect(gmailTransport.name).toBe("gmail");
  expect(mailtrapTransport.name).toBe("mailtrap");
  expect(emailTransport({ EMAIL_PROVIDER: "gmail" })).toBe(gmailTransport);
  expect(emailTransport({ EMAIL_PROVIDER: "mailtrap" })).toBe(mailtrapTransport);
  expect(typeof gmailTransport.send).toBe("function");
  expect(typeof mailtrapTransport.send).toBe("function");
});
