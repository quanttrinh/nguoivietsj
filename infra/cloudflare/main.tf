locals {
  zone_id    = trimspace(var.cloudflare_zone_id)
  account_id = trimspace(var.cloudflare_account_id)

  staging_allowed_emails = length(var.staging_allowed_emails) > 0 ? var.staging_allowed_emails : var.allowed_emails
  staff_allowed_emails   = length(var.staff_allowed_emails) > 0 ? var.staff_allowed_emails : var.allowed_emails

  # OpenTofu is the source of truth for D1 names and IDs. `bun run cf:sync`
  # writes both into wrangler.jsonc.
  databases = {
    app            = "nguoivietsj-db"
    events         = "nguoivietsj-event-engine-db"
    staging_app    = "nguoivietsj-staging-db"
    staging_events = "nguoivietsj-staging-event-engine-db"
  }
}

resource "cloudflare_zero_trust_access_policy" "staff_email" {
  account_id = local.account_id
  name       = "Allow event team"
  decision   = "allow"
  include = [
    for email in local.staff_allowed_emails : {
      email = {
        email = email
      }
    }
  ]
}

resource "cloudflare_zero_trust_access_policy" "staging_email" {
  account_id = local.account_id
  name       = "Allow event team"
  decision   = "allow"
  include = [
    for email in local.staging_allowed_emails : {
      email = {
        email = email
      }
    }
  ]
}

resource "cloudflare_zero_trust_access_policy" "service_tokens" {
  count = length(var.access_service_token_ids) > 0 ? 1 : 0

  account_id = local.account_id
  name       = "Allow service tokens"
  decision   = "non_identity"
  include = [
    for token_id in var.access_service_token_ids : {
      service_token = {
        token_id = token_id
      }
    }
  ]
}

resource "cloudflare_zone_setting" "always_use_https" {
  zone_id    = local.zone_id
  setting_id = "always_use_https"
  value      = "on"
}

data "cloudflare_zero_trust_organization" "current" {
  account_id = local.account_id
}

data "cloudflare_d1_databases" "this" {
  for_each = local.databases

  account_id = local.account_id
  name       = each.value
}

resource "cloudflare_zone_setting" "automatic_https_rewrites" {
  zone_id    = local.zone_id
  setting_id = "automatic_https_rewrites"
  value      = "on"
}

resource "cloudflare_zone_setting" "min_tls_version" {
  zone_id    = local.zone_id
  setting_id = "min_tls_version"
  value      = "1.2"
}

resource "cloudflare_zone_setting" "tls_1_3" {
  zone_id    = local.zone_id
  setting_id = "tls_1_3"
  value      = "on"
}

resource "cloudflare_zone_setting" "ssl" {
  zone_id    = local.zone_id
  setting_id = "ssl"
  value      = "strict"
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
    expression  = "(http.request.method eq \"POST\" and http.request.uri.path matches ${jsonencode(var.public_registration_path_regex)})"
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
    # WAF custom rule above.
    expression = "(http.request.uri.path matches ${jsonencode(var.public_registration_path_regex)})"
    action     = "block"

    ratelimit = {
      characteristics     = ["cf.colo.id", "ip.src"]
      period              = 10
      requests_per_period = 10
      mitigation_timeout  = 10
    }
  }]
}

resource "cloudflare_zero_trust_access_application" "staff" {
  count = var.enable_staff_access ? 1 : 0

  account_id = local.account_id
  name       = "Event engine admin"
  domain     = var.staff_primary_domain
  destinations = [
    for uri in var.staff_destinations : {
      uri  = uri
      type = "public"
    }
  ]
  type                       = "self_hosted"
  session_duration           = "8h"
  auto_redirect_to_identity  = false
  app_launcher_visible       = false
  enable_binding_cookie      = true
  http_only_cookie_attribute = true
  same_site_cookie_attribute = "lax"

  policies = concat(
    [{
      id         = cloudflare_zero_trust_access_policy.staff_email.id
      precedence = 1
    }],
    length(var.access_service_token_ids) > 0 ? [{
      id         = cloudflare_zero_trust_access_policy.service_tokens[0].id
      precedence = 2
    }] : [],
  )
}

resource "cloudflare_zero_trust_access_application" "staging" {
  account_id                 = local.account_id
  name                       = "Event engine staging"
  domain                     = var.staging_hostname
  type                       = "self_hosted"
  session_duration           = "8h"
  auto_redirect_to_identity  = false
  app_launcher_visible       = false
  enable_binding_cookie      = true
  http_only_cookie_attribute = true
  same_site_cookie_attribute = "lax"

  policies = concat(
    [{
      id         = cloudflare_zero_trust_access_policy.staging_email.id
      precedence = 1
    }],
    length(var.access_service_token_ids) > 0 ? [{
      id         = cloudflare_zero_trust_access_policy.service_tokens[0].id
      precedence = 2
    }] : [],
  )
}
