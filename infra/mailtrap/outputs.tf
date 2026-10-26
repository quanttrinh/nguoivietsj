output "registration_template_uuid" {
  description = "Mailtrap template UUID for registration-received email. Set by `bun scripts/infra.ts sync`."
  value       = mailtrap_email_template.registration_received.uuid
}

output "payment_template_uuid" {
  description = "Mailtrap template UUID for payment-confirmed email. Set by `bun scripts/infra.ts sync`."
  value       = mailtrap_email_template.payment_confirmed.uuid
}

output "status_otp_template_uuid" {
  description = "Mailtrap template UUID for registration status OTP email. Set by `bun scripts/infra.ts sync`."
  value       = mailtrap_email_template.status_otp.uuid
}
