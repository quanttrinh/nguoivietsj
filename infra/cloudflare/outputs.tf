output "staging_access_aud" {
  description = "AUD tag for the staging Access application."
  value       = cloudflare_zero_trust_access_application.staging.aud
}

output "access_team_domain" {
  description = "Cloudflare Access team domain, ready for CF_ACCESS_TEAM_DOMAIN."
  value       = "https://${data.cloudflare_zero_trust_organization.current.auth_domain}"
}

output "staff_access_aud" {
  description = "AUD tag for the production event-engine admin Access application, when enabled."
  value       = try(cloudflare_zero_trust_access_application.staff[0].aud, "")
}

output "staff_access_enabled" {
  description = "Whether the production event-engine admin Access application is enabled."
  value       = var.enable_staff_access
}

output "turnstile_site_key" {
  description = "Site key for the registration Turnstile widget. Set this in the matching wrangler.jsonc environment vars."
  value       = cloudflare_turnstile_widget.registration.sitekey
}

output "turnstile_secret" {
  description = "Secret key for the registration Turnstile widget. Store it with wrangler secret put."
  value       = cloudflare_turnstile_widget.registration.secret
  sensitive   = true
}

output "app_db_id" {
  description = "D1 database UUID for APP_DB. Set by `bun run cf:sync`."
  value       = try(data.cloudflare_d1_databases.this["app"].result[0].uuid, "")
}

output "app_db_name" {
  description = "D1 database name for APP_DB. Set by `bun run cf:sync`."
  value       = local.databases["app"]
}

output "events_db_id" {
  description = "D1 database UUID for EVENT_ENGINE_DB. Set by `bun run cf:sync`."
  value       = try(data.cloudflare_d1_databases.this["events"].result[0].uuid, "")
}

output "events_db_name" {
  description = "D1 database name for EVENT_ENGINE_DB. Set by `bun run cf:sync`."
  value       = local.databases["events"]
}

output "staging_app_db_id" {
  description = "D1 database UUID for staging APP_DB. Set by `bun run cf:sync`."
  value       = try(data.cloudflare_d1_databases.this["staging_app"].result[0].uuid, "")
}

output "staging_app_db_name" {
  description = "D1 database name for staging APP_DB. Set by `bun run cf:sync`."
  value       = local.databases["staging_app"]
}

output "staging_events_db_id" {
  description = "D1 database UUID for staging EVENT_ENGINE_DB. Set by `bun run cf:sync`."
  value       = try(data.cloudflare_d1_databases.this["staging_events"].result[0].uuid, "")
}

output "staging_events_db_name" {
  description = "D1 database name for staging EVENT_ENGINE_DB. Set by `bun run cf:sync`."
  value       = local.databases["staging_events"]
}
