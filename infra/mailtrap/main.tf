resource "mailtrap_email_template" "registration_received" {
  name      = "Event registration received"
  category  = "Event registration"
  subject   = "Registration received: {{event_title}}"
  body_html = file("${path.module}/../../src/events/services/email/templates/registration-received.html")
  body_text = file("${path.module}/../../src/events/services/email/templates/registration-received.txt")
}

resource "mailtrap_email_template" "payment_confirmed" {
  name      = "Event payment confirmed"
  category  = "Event registration"
  subject   = "Payment confirmed: {{event_title}}"
  body_html = file("${path.module}/../../src/events/services/email/templates/payment-confirmed.html")
  body_text = file("${path.module}/../../src/events/services/email/templates/payment-confirmed.txt")
}

resource "mailtrap_email_template" "status_otp" {
  name      = "Registration status verification code"
  category  = "Authentication"
  subject   = "Your verification code: {{code}}"
  body_html = file("${path.module}/../../src/events/services/email/templates/status-otp.html")
  body_text = file("${path.module}/../../src/events/services/email/templates/status-otp.txt")
}
