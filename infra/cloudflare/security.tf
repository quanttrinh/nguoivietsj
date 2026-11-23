# Free-plan bot and AI traffic controls.
resource "cloudflare_bot_management" "this" {
  zone_id = local.zone_id

  fight_mode = var.bot_fight_mode_enabled
  enable_js  = true

  # AI Labyrinth: trap crawlers that ignore robots.txt.
  crawler_protection = var.ai_labyrinth_enabled ? "enabled" : "disabled"

  # AI Crawl Control.
  ai_training = var.ai_training_policy
  ai_user     = var.ai_user_policy
  aisearch    = var.ai_search_policy

  # Managed robots.txt / Bot Preference Sync.
  bot_preference_sync_enabled = var.managed_robots_enabled
  is_robots_txt_managed       = var.managed_robots_enabled
  cf_robots_variant           = "policy_only"

  lifecycle {
    precondition {
      condition     = !var.managed_robots_enabled || var.ai_training_policy == "disallow"
      error_message = "Managed robots.txt requires ai_training_policy = \"disallow\"."
    }
  }
}

# Password-only leaked-credential detection is free; paid plans add pair checks.
resource "cloudflare_leaked_credential_check" "this" {
  zone_id = local.zone_id
  enabled = true
}

# Enables zone signing. Add the output DS record at the registrar to complete
# validation.
resource "cloudflare_zone_dnssec" "this" {
  zone_id = local.zone_id
  status  = "active"
}
