locals {
  zone_id    = trimspace(var.cloudflare_zone_id)
  account_id = trimspace(var.cloudflare_account_id)
  wrangler   = jsondecode(file("${path.module}/../../wrangler.json"))

  production_routes = [
    for route in local.wrangler.routes : route.pattern
    if route.custom_domain == true && !strcontains(route.pattern, "*")
  ]
  staging_routes = [
    for route in local.wrangler.env.staging.routes : route.pattern
    if route.custom_domain == true && !strcontains(route.pattern, "*")
  ]
  zone_name         = one(local.production_routes)
  staging_hostname  = one(local.staging_routes)
  turnstile_domains = distinct([local.zone_name, local.staging_hostname])

  wrangler_environments = merge(
    { production = local.wrangler },
    try(local.wrangler.env, {}),
  )

  d1_bindings = merge([
    for environment, config in local.wrangler_environments : {
      for database in config.d1_databases :
      "${environment}/${database.binding}" => merge(database, { environment = environment })
    }
  ]...)

  kv_bindings = merge([
    for environment, config in local.wrangler_environments : {
      for namespace in config.kv_namespaces :
      "${environment}/${namespace.binding}" => merge(namespace, {
        environment = environment
        title       = "${config.name}-${lower(replace(namespace.binding, "_", "-"))}"
      })
    }
  ]...)

  allowed_emails = length(var.staging_allowed_emails) > 0 ? var.staging_allowed_emails : var.allowed_emails

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

  rate_limit_paths = distinct(concat(
    [var.public_registration_path_pattern],
    var.additional_rate_limit_paths,
  ))
}

resource "cloudflare_zone_setting" "this" {
  for_each = local.zone_settings

  zone_id    = local.zone_id
  setting_id = each.key
  value      = each.value
}

data "cloudflare_d1_databases" "this" {
  for_each = local.d1_bindings

  account_id = local.account_id
  name       = each.value.database_name
}

data "cloudflare_workers_kv_namespaces" "this" {
  account_id = local.account_id
}

locals {
  d1_resolved = {
    for key, database in data.cloudflare_d1_databases.this : key => one(database.result)
  }

  kv_resolved = {
    for key, namespace in local.kv_bindings : key => one([
      for item in data.cloudflare_workers_kv_namespaces.this.result : item
      if item.title == namespace.title
    ])
  }
}

resource "cloudflare_zone_setting" "security_header" {
  zone_id    = local.zone_id
  setting_id = "security_header"
  value = {
    strict_transport_security = {
      enabled            = true
      include_subdomains = var.hsts_include_subdomains
      max_age            = var.hsts_max_age
      nosniff            = true
      preload            = var.hsts_preload
    }
  }

  lifecycle {
    precondition {
      condition     = !var.hsts_preload || var.hsts_max_age >= 63072000
      error_message = "HSTS preload requires hsts_max_age of at least 63072000 seconds (two years)."
    }
  }
}

resource "cloudflare_turnstile_widget" "registration" {
  account_id = local.account_id
  name       = var.turnstile_widget_name
  # The provider requires domains in alphabetical order to avoid perpetual drift.
  domains         = sort(local.turnstile_domains)
  mode            = var.turnstile_widget_mode
  clearance_level = var.turnstile_clearance_level
  bot_fight_mode  = false

  lifecycle {
    precondition {
      condition = contains(local.turnstile_domains, local.staging_hostname) && (
        local.staging_hostname == local.zone_name ||
        endswith(local.staging_hostname, ".${local.zone_name}")
      )
      error_message = "staging_hostname must be the apex zone or a subdomain of it, and must be listed in turnstile_domains."
    }
  }
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
    description = "Block bursts above ${var.rate_limit_requests} requests per ${var.rate_limit_period} seconds per IP"
    # Free-plan rate limiting only permits Path and Verified Bot expression
    # fields. Do not add http.request.method here; method filtering lives in the
    # WAF custom rule above. A single rule is allowed, so cover the other
    # unauthenticated endpoints that benefit from burst protection.
    expression = join(" or ", [
      for path in local.rate_limit_paths : "(http.request.uri.path wildcard ${jsonencode(path)})"
    ])
    action = "block"

    ratelimit = {
      characteristics     = ["cf.colo.id", "ip.src"]
      period              = var.rate_limit_period
      requests_per_period = var.rate_limit_requests
      mitigation_timeout  = var.rate_limit_mitigation_timeout
    }
  }]
}

resource "cloudflare_zero_trust_access_application" "staging" {
  account_id = local.account_id
  name       = "Event engine staging"
  domain     = local.staging_hostname
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
        for email in local.allowed_emails : {
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
