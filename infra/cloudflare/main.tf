locals {
  wrangler = jsondecode(file("${path.module}/../../wrangler.json"))

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

  queue_bindings = merge([
    for environment, config in local.wrangler_environments : {
      for name in distinct(flatten([
        [for producer in try(config.queues.producers, []) : producer.queue],
        [for consumer in try(config.queues.consumers, []) : consumer.queue],
        [
          for consumer in try(config.queues.consumers, []) :
          consumer.dead_letter_queue
          if try(consumer.dead_letter_queue, null) != null
        ],
      ])) :
      "${environment}/${name}" => {
        environment = environment
        name        = name
      }
    }
  ]...)

  # `security_header` is separate because its value is an object.
  zone_settings = {
    always_use_https         = "on"
    automatic_https_rewrites = "on"
    brotli                   = "on"
    min_tls_version          = "1.2"
    ssl                      = "strict"
    tls_1_3                  = "on"
  }
}

# Zone and account IDs come from the wrangler.json route.
data "cloudflare_zones" "this" {
  name = local.zone_name
}

locals {
  zone_id    = try(data.cloudflare_zones.this.result[0].id, null)
  account_id = try(data.cloudflare_zones.this.result[0].account.id, null)
}

resource "terraform_data" "zone_exists" {
  input = local.zone_name

  lifecycle {
    precondition {
      condition     = length(data.cloudflare_zones.this.result) == 1
      error_message = "Expected exactly one Cloudflare zone named \"${local.zone_name}\"; found ${length(data.cloudflare_zones.this.result)} for this token."
    }
  }
}

resource "cloudflare_zone_setting" "this" {
  for_each = local.zone_settings

  zone_id    = local.zone_id
  setting_id = each.key
  value      = each.value
}

# prevent_destroy stops a removed binding or destroy plan from deleting data.
resource "cloudflare_d1_database" "this" {
  for_each = local.d1_bindings

  account_id = local.account_id
  name       = each.value.database_name

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_workers_kv_namespace" "this" {
  for_each = local.kv_bindings

  account_id = local.account_id
  title      = each.value.title

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_queue" "this" {
  for_each = local.queue_bindings

  account_id = local.account_id
  queue_name = each.value.name

  lifecycle {
    prevent_destroy = true
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

resource "cloudflare_ruleset" "challenge" {
  # Enable only after the Worker is deployed with the Turnstile key. Otherwise
  # a fetch-based form can receive an HTML challenge.
  count = var.turnstile_preclearance_confirmed ? 1 : 0

  zone_id     = local.zone_id
  name        = "Path challenge"
  description = "Managed Challenge for POST requests matching challenge_path_patterns."
  kind        = "zone"
  phase       = "http_request_firewall_custom"

  rules = [{
    ref         = "challenge_matched_paths"
    description = "Challenge unverified POST requests matching challenge_path_patterns"
    expression = join(" or ", [
      for path in var.challenge_path_patterns :
      "(http.request.method eq \"POST\" and http.request.uri.path wildcard ${jsonencode(path)})"
    ])
    action = "managed_challenge"
  }]

  depends_on = [cloudflare_turnstile_widget.registration]
}

resource "cloudflare_ruleset" "rate_limit" {
  zone_id     = local.zone_id
  name        = "Path rate limit"
  description = "Free-plan burst protection for requests matching rate_limit_paths."
  kind        = "zone"
  phase       = "http_ratelimit"

  rules = [{
    ref         = "rate_limit_matched_paths"
    description = "Block bursts above ${var.rate_limit_requests} requests per ${var.rate_limit_period} seconds per IP"
    # Free-plan rate limiting only permits Path and Verified Bot expression
    # fields. Do not add http.request.method here; method filtering lives in the
    # WAF custom rule above. A single rule is allowed, so list every path that
    # benefits from burst protection in rate_limit_paths.
    expression = join(" or ", [
      for path in var.rate_limit_paths : "(http.request.uri.path wildcard ${jsonencode(path)})"
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
        for email in var.staging_allowed_emails : {
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
