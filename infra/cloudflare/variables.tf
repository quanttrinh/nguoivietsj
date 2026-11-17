variable "cloudflare_zone_id" {
  description = "Zone ID for nguoivietsj.ca."
  type        = string

  validation {
    condition     = can(regex("^[0-9a-fA-F]{32}$", trimspace(var.cloudflare_zone_id)))
    error_message = "cloudflare_zone_id must be a 32-character hexadecimal Cloudflare zone ID."
  }
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID that owns the zone and Zero Trust organization."
  type        = string

  validation {
    condition     = can(regex("^[0-9a-fA-F]{32}$", trimspace(var.cloudflare_account_id)))
    error_message = "cloudflare_account_id must be a 32-character hexadecimal Cloudflare account ID."
  }
}

variable "staging_hostname" {
  description = "Hostname protected end-to-end by Cloudflare Access."
  type        = string
  default     = "staging.nguoivietsj.ca"

  validation {
    condition     = can(regex("^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$", var.staging_hostname))
    error_message = "staging_hostname must be a lowercase hostname without a scheme, port, or path."
  }
}

variable "staging_session_duration" {
  description = "Cloudflare Access session duration for the staging application."
  type        = string
  default     = "8h"

  validation {
    condition     = can(regex("^[0-9]+(?:ms|s|m|h)$", var.staging_session_duration))
    error_message = "staging_session_duration must use a Cloudflare Access duration such as 30m, 8h, or 24h."
  }
}

variable "public_registration_path_pattern" {
  description = "Wildcard pattern matching public event registration API paths for the WAF challenge. The `wildcard` operator is available on the Free plan, unlike `matches`."
  type        = string
  default     = "/api/events/*/registrations"

  validation {
    condition     = length(var.public_registration_path_pattern) > 0
    error_message = "public_registration_path_pattern must not be empty."
  }
}

variable "turnstile_preclearance_confirmed" {
  description = "Set to true only after the Turnstile widget is applied and the Worker is deployed with its site key and secret. This gates the WAF challenge until clearance is live."
  type        = bool
  default     = false
}

variable "hsts_include_subdomains" {
  description = "Include subdomains in the zone HSTS policy. Enable only after confirming every subdomain serves HTTPS."
  type        = bool
  default     = false
}

variable "turnstile_widget_name" {
  description = "Name of the Turnstile widget managed for the registration form."
  type        = string
  default     = "Event registration"
}

variable "turnstile_widget_mode" {
  description = "Turnstile widget mode."
  type        = string
  default     = "managed"

  validation {
    condition     = contains(["non-interactive", "invisible", "managed"], var.turnstile_widget_mode)
    error_message = "turnstile_widget_mode must be non-interactive, invisible, or managed."
  }
}

variable "turnstile_clearance_level" {
  description = "Challenge clearance granted by the Turnstile widget. managed matches the WAF managed_challenge rule."
  type        = string
  default     = "managed"

  validation {
    condition     = contains(["no_clearance", "jschallenge", "managed", "interactive"], var.turnstile_clearance_level)
    error_message = "turnstile_clearance_level must be no_clearance, jschallenge, managed, or interactive."
  }
}

variable "turnstile_domains" {
  description = "Hostnames where the Turnstile widget is allowed to run."
  type        = list(string)
  default     = ["nguoivietsj.ca", "staging.nguoivietsj.ca"]

  validation {
    condition = length(var.turnstile_domains) > 0 && alltrue([
      for domain in var.turnstile_domains : can(regex(
        "^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$",
        domain,
      ))
    ])
    error_message = "turnstile_domains must contain at least one lowercase hostname without a scheme or path."
  }
}

variable "dns_records" {
  description = "Additional DNS records not owned by Wrangler, keyed by a stable name. Do not add records already managed by Wrangler custom domains."
  type = map(object({
    name     = string
    type     = string
    content  = string
    ttl      = optional(number, 1)
    proxied  = optional(bool, false)
    priority = optional(number)
    comment  = optional(string)
  }))
  default = {}

  validation {
    condition = alltrue([
      for record in values(var.dns_records) : contains(
        ["A", "AAAA", "CNAME", "MX", "NS", "TXT", "CAA", "SRV"],
        record.type,
      )
    ])
    error_message = "dns_records supports A, AAAA, CNAME, MX, NS, TXT, CAA, and SRV records."
  }

  validation {
    condition = alltrue([
      for record in values(var.dns_records) : !record.proxied || contains(["A", "AAAA", "CNAME"], record.type)
    ])
    error_message = "Only A, AAAA, and CNAME records can be proxied."
  }

  validation {
    condition = alltrue([
      for record in values(var.dns_records) : record.ttl == 1 || (record.ttl >= 60 && record.ttl <= 86400)
    ])
    error_message = "dns_records ttl must be 1 (automatic) or between 60 and 86400 seconds."
  }
}

variable "allowed_emails" {
  description = "Default email addresses allowed through the staging Cloudflare Access application."
  type        = list(string)

  validation {
    condition     = length(var.allowed_emails) > 0 && length(var.allowed_emails) <= 50
    error_message = "allowed_emails must contain between 1 and 50 addresses on the Zero Trust Free plan."
  }

  validation {
    condition     = alltrue([for email in var.allowed_emails : can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", email))])
    error_message = "allowed_emails contains an invalid email address."
  }
}

variable "staging_allowed_emails" {
  description = "Optional staging-specific Access allow list. Defaults to allowed_emails when empty."
  type        = list(string)
  default     = []

  validation {
    condition = length(var.staging_allowed_emails) <= 50 && alltrue([
      for email in var.staging_allowed_emails : can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", email))
    ])
    error_message = "staging_allowed_emails must contain no more than 50 valid email addresses."
  }
}

variable "access_service_token_ids" {
  description = "Optional Access service token IDs allowed through the staging Service Auth policy, for example CI smoke tests."
  type        = list(string)
  default     = []

  validation {
    condition = alltrue([
      for id in var.access_service_token_ids : can(regex(
        "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
        id,
      ))
    ])
    error_message = "access_service_token_ids contains an invalid service token ID."
  }
}
