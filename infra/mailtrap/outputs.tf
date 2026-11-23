# Flat map of exact Wrangler variable name -> template UUID. render-config
# merges every entry into the generated Wrangler vars; it does not hardcode
# individual template names. The keys come from wrangler.json via main.tf.
output "mailtrap_templates" {
  description = "Mailtrap template UUIDs keyed by the exact Wrangler var name. Merged into wrangler vars by render-config."
  value = {
    for name in local.template_var_names : name => mailtrap_email_template.this[name].uuid
  }
}

# For human inspection only; the deploy pipeline does not consume this map.
output "mailtrap_template_details" {
  description = "Mailtrap template details keyed by Wrangler var name, for human inspection."
  value = {
    for name in local.template_var_names : name => {
      name     = local.template_definitions[name].name
      category = local.template_definitions[name].category
      subject  = local.template_definitions[name].subject
      uuid     = mailtrap_email_template.this[name].uuid
    }
  }
}
