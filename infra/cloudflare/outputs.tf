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
  description = "D1 database UUID for APP_DB. Set by `bun scripts/infra.ts sync`."
  value       = try(data.cloudflare_d1_databases.this["app"].result[0].uuid, "")
}

output "app_db_name" {
  description = "D1 database name for APP_DB. Set by `bun scripts/infra.ts sync`."
  value       = local.databases["app"]
}

output "events_db_id" {
  description = "D1 database UUID for EVENT_ENGINE_DB. Set by `bun scripts/infra.ts sync`."
  value       = try(data.cloudflare_d1_databases.this["events"].result[0].uuid, "")
}

output "events_db_name" {
  description = "D1 database name for EVENT_ENGINE_DB. Set by `bun scripts/infra.ts sync`."
  value       = local.databases["events"]
}

output "staging_app_db_id" {
  description = "D1 database UUID for staging APP_DB. Set by `bun scripts/infra.ts sync`."
  value       = try(data.cloudflare_d1_databases.this["staging_app"].result[0].uuid, "")
}

output "staging_app_db_name" {
  description = "D1 database name for staging APP_DB. Set by `bun scripts/infra.ts sync`."
  value       = local.databases["staging_app"]
}

output "staging_events_db_id" {
  description = "D1 database UUID for staging EVENT_ENGINE_DB. Set by `bun scripts/infra.ts sync`."
  value       = try(data.cloudflare_d1_databases.this["staging_events"].result[0].uuid, "")
}

output "staging_events_db_name" {
  description = "D1 database name for staging EVENT_ENGINE_DB. Set by `bun scripts/infra.ts sync`."
  value       = local.databases["staging_events"]
}

output "auth_kv_id" {
  description = "Workers KV namespace ID for the production AUTH_SESSION_KV binding. Set by `bun scripts/infra.ts sync`."
  value       = local.kv_ids["app"]
}

output "auth_kv_name" {
  description = "Workers KV namespace title for the production AUTH_SESSION_KV binding."
  value       = local.kv_namespaces["app"]
}

output "staging_auth_kv_id" {
  description = "Workers KV namespace ID for the staging AUTH_SESSION_KV binding. Set by `bun scripts/infra.ts sync`."
  value       = local.kv_ids["staging_app"]
}

output "staging_auth_kv_name" {
  description = "Workers KV namespace title for the staging AUTH_SESSION_KV binding."
  value       = local.kv_namespaces["staging_app"]
}
