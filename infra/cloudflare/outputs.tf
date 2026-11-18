output "turnstile_site_key" {
  description = "Site key for the registration Turnstile widget. Published to Doppler by the deploy workflow."
  value       = cloudflare_turnstile_widget.registration.sitekey
}

output "turnstile_secret" {
  description = "Secret key for the registration Turnstile widget. Stored with wrangler secret put."
  value       = cloudflare_turnstile_widget.registration.secret
  sensitive   = true
}

output "d1_databases" {
  description = "D1 bindings declared in wrangler.json, keyed by environment/binding."
  value = {
    for key, database in local.d1_bindings : key => {
      environment = database.environment
      binding     = database.binding
      name        = local.d1_resolved[key].name
      id          = local.d1_resolved[key].uuid
    }
  }
}

output "kv_namespaces" {
  description = "Workers KV bindings declared in wrangler.json, keyed by environment/binding."
  value = {
    for key, namespace in local.kv_bindings : key => {
      environment = namespace.environment
      binding     = namespace.binding
      id          = local.kv_resolved[key].id
      title       = local.kv_resolved[key].title
    }
  }
}

output "zone_name" {
  description = "Apex zone derived from the production wrangler.json route."
  value       = local.zone_name
}

output "staging_hostname" {
  description = "Staging hostname derived from the staging wrangler.json route."
  value       = local.staging_hostname
}
