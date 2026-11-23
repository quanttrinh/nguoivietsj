# Mailtrap email templates used by the Worker. The set of templates is derived
# from wrangler.json (which generates the Env types); bodies and presentation
# metadata live here so template changes go through code review and OpenTofu,
# not the Mailtrap UI.
locals {
  wrangler = jsondecode(file("${path.module}/../../wrangler.json"))

  # wrangler.json is the source of truth for which templates exist. Every
  # MAILTRAP_TEMPLATE_* var in it becomes one managed Mailtrap template.
  template_var_names = sort([
    for name in keys(local.wrangler.vars) : name
    if startswith(name, "MAILTRAP_TEMPLATE_")
  ])

  staging_template_var_names = sort([
    for name in keys(try(local.wrangler.env.staging.vars, {})) : name
    if startswith(name, "MAILTRAP_TEMPLATE_")
  ])

  # Presentation metadata and bodies, keyed by the exact Wrangler var name.
  template_definitions = {
    MAILTRAP_TEMPLATE_REGISTRATION_RECEIVED = {
      name     = "Registration received"
      category = "Events"
      subject  = "Registration received: {{event_title}}"
      html     = "${path.module}/templates/registration-received.html"
      text     = "${path.module}/templates/registration-received.txt"
    }
    MAILTRAP_TEMPLATE_PAYMENT_CONFIRMED = {
      name     = "Payment confirmed"
      category = "Events"
      subject  = "Payment confirmed: {{event_title}}"
      html     = "${path.module}/templates/payment-confirmed.html"
      text     = "${path.module}/templates/payment-confirmed.txt"
    }
    MAILTRAP_TEMPLATE_STATUS_OTP = {
      name     = "Status verification code"
      category = "Events"
      subject  = "Your verification code: {{code}}"
      html     = "${path.module}/templates/status-otp.html"
      text     = "${path.module}/templates/status-otp.txt"
    }
    MAILTRAP_TEMPLATE_TWO_FACTOR_CODE = {
      name     = "Two-factor sign-in code"
      category = "Auth"
      subject  = "Người Việt SJ sign-in code: {{code}}"
      html     = "${path.module}/templates/two-factor-code.html"
      text     = "${path.module}/templates/two-factor-code.txt"
    }
  }
}

# Fail validation when the declared env vars and the template definitions drift
# apart, instead of silently managing the wrong set of templates.
check "wrangler_template_vars" {
  assert {
    condition     = length(setsubtract(local.template_var_names, keys(local.template_definitions))) == 0 && length(setsubtract(keys(local.template_definitions), local.template_var_names)) == 0
    error_message = "MAILTRAP_TEMPLATE_* vars in wrangler.json must match template_definitions in infra/mailtrap/main.tf."
  }

  assert {
    condition = length(local.staging_template_var_names) == length(local.template_var_names) && alltrue([
      for name in local.template_var_names : contains(local.staging_template_var_names, name)
    ])
    error_message = "Production and staging must declare the same MAILTRAP_TEMPLATE_* vars in wrangler.json."
  }
}

resource "mailtrap_email_template" "this" {
  for_each = toset(local.template_var_names)

  name      = local.template_definitions[each.value].name
  category  = local.template_definitions[each.value].category
  subject   = local.template_definitions[each.value].subject
  body_html = file(local.template_definitions[each.value].html)
  body_text = file(local.template_definitions[each.value].text)

  # A removed or renamed var must never destroy a live template.
  lifecycle {
    prevent_destroy = true
  }
}
