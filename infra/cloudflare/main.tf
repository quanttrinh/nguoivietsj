locals {
  zone_id    = trimspace(var.cloudflare_zone_id)
  account_id = trimspace(var.cloudflare_account_id)

  staging_allowed_emails = length(var.staging_allowed_emails) > 0 ? var.staging_allowed_emails : var.allowed_emails

  # OpenTofu is the source of truth for D1 and KV names. `bun scripts/infra.ts sync`
  # writes both the names and IDs into wrangler.jsonc.
  databases = {
    app            = "nguoivietsj-db"
    events         = "nguoivietsj-event-engine-db"
    staging_app    = "nguoivietsj-staging-db"
    staging_events = "nguoivietsj-staging-event-engine-db"
  }

  kv_namespaces = {
    app         = "nguoivietsj-auth-kv"
    staging_app = "nguoivietsj-staging-auth-kv"
  }

  # String-valued zone settings. `security_header` is separate because its value
  # is an object.
  zone_settings = {
    always_use_https         = "on"
    automatic_https_rewrites = "on"
    brotli                   = "on"
    min_tls_version          = "1.2"
    ssl                      = "strict"
    tls_1_3                  = "on"
  }
}

# Cloudflare Access is deliberately scoped to the staging hostname. Production
# staff authentication is handled in-app by Better Auth (email + password),
# with authorization enforced by the `users.role` column.

resource "cloudflare_zone_setting" "this" {
  for_each = local.zone_settings

  zone_id    = local.zone_id
  setting_id = each.key
  value      = each.value
}

data "cloudflare_d1_databases" "this" {
  for_each = local.databases

  account_id = local.account_id
  name       = each.value
}

data "cloudflare_workers_kv_namespaces" "this" {
  account_id = local.account_id
}

locals {
  kv_ids = {
    for key, title in local.kv_namespaces : key => try(
      [for namespace in data.cloudflare_workers_kv_namespaces.this.result : namespace.id if namespace.title == title][0],
      "",
    )
  }
}

resource "cloudflare_zone_setting" "security_header" {
  zone_id    = local.zone_id
  setting_id = "security_header"
  value = {
    strict_transport_security = {
      enabled            = true
      include_subdomains = var.hsts_include_subdomains
      max_age            = 31536000
      nosniff            = true
      preload            = false
    }
  }
}

resource "cloudflare_turnstile_widget" "registration" {
  account_id = local.account_id
  name       = var.turnstile_widget_name
  # The provider requires domains in alphabetical order to avoid perpetual drift.
  domains         = sort(var.turnstile_domains)
  mode            = var.turnstile_widget_mode
  clearance_level = var.turnstile_clearance_level
  bot_fight_mode  = false
}

resource "cloudflare_dns_record" "additional" {
  for_each = var.dns_records

  zone_id  = local.zone_id
  name     = each.value.name
  type     = each.value.type
  content  = each.value.content
  ttl      = each.value.ttl
  proxied  = each.value.proxied
  priority = each.value.priority
  comment  = each.value.comment
}

resource "cloudflare_ruleset" "public_api_challenge" {
  # Enable this only after the Turnstile widget is applied and the Worker is
  # deployed with its site key and secret. Applying the challenge before that
  # can return an HTML challenge to the registration fetch.
  count = var.turnstile_preclearance_confirmed ? 1 : 0

  zone_id     = local.zone_id
  name        = "Public event registration challenge"
  description = "Managed Challenge for public event registration API requests."
  kind        = "zone"
  phase       = "http_request_firewall_custom"

  rules = [{
    ref         = "challenge_public_forms"
    description = "Challenge unverified public event registration requests"
    expression  = "(http.request.method eq \"POST\" and http.request.uri.path wildcard ${jsonencode(var.public_registration_path_pattern)})"
    action      = "managed_challenge"
  }]

  depends_on = [cloudflare_turnstile_widget.registration]
}

resource "cloudflare_ruleset" "public_api_rate_limit" {
  zone_id     = local.zone_id
  name        = "Public event registration rate limit"
  description = "Free-plan burst protection for public event registration API requests."
  kind        = "zone"
  phase       = "http_ratelimit"

  rules = [{
    ref         = "rate_limit_public_forms"
    description = "Block bursts above 10 requests per 10 seconds per IP"
    # Free-plan rate limiting only permits Path and Verified Bot expression
    # fields. Do not add http.request.method here; keep method filtering in the
    # WAF custom rule above. A single rule is allowed, so cover the other
    # unauthenticated endpoints that benefit from burst protection.
    expression = "(http.request.uri.path wildcard ${jsonencode(var.public_registration_path_pattern)} or http.request.uri.path wildcard \"/api/events/status/*\" or http.request.uri.path wildcard \"/api/auth/sign-in/*\")"
    action     = "block"

    ratelimit = {
      characteristics     = ["cf.colo.id", "ip.src"]
      period              = 10
      requests_per_period = 10
      mitigation_timeout  = 10
    }
  }]
}

resource "cloudflare_zero_trust_access_application" "staging" {
  account_id = local.account_id
  name       = "Event engine staging"
  domain     = var.staging_hostname
  type       = "self_hosted"

  session_duration           = var.staging_session_duration
  auto_redirect_to_identity  = false
  app_launcher_visible       = false
  enable_binding_cookie      = true
  http_only_cookie_attribute = true
  same_site_cookie_attribute = "lax"

  policies = concat(
    [{
      name       = "Allow staging team"
      decision   = "allow"
      precedence = 1
      include = [
        for email in local.staging_allowed_emails : {
          email = {
            email = email
          }
        }
      ]
    }],
    length(var.access_service_token_ids) > 0 ? [{
      name       = "Allow service tokens"
      decision   = "non_identity"
      precedence = 2
      include = [
        for token_id in var.access_service_token_ids : {
          service_token = {
            token_id = token_id
          }
        }
      ]
    }] : [],
  )
}
