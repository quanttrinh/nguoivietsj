variable "challenge_path_patterns" {
  description = "Wildcard path patterns that receive a Managed Challenge on POST requests."
  type        = list(string)

  validation {
    condition = length(var.challenge_path_patterns) > 0 && alltrue([
      for path in var.challenge_path_patterns : startswith(path, "/")
    ])
    error_message = "challenge_path_patterns must contain absolute path patterns."
  }
}

variable "rate_limit_paths" {
  description = "Wildcard path patterns covered by the zone rate-limit rule."
  type        = list(string)

  validation {
    condition = length(var.rate_limit_paths) > 0 && alltrue([
      for path in var.rate_limit_paths : startswith(path, "/")
    ])
    error_message = "rate_limit_paths must contain absolute path patterns."
  }
}

variable "rate_limit_requests" {
  description = "Requests allowed per rate-limit period."
  type        = number
  default     = 10

  validation {
    condition     = var.rate_limit_requests >= 1 && var.rate_limit_requests <= 1000
    error_message = "rate_limit_requests must be between 1 and 1000."
  }
}

variable "rate_limit_period" {
  description = "Rate-limit counting window in seconds."
  type        = number
  default     = 10

  validation {
    condition     = var.rate_limit_period >= 10 && var.rate_limit_period <= 3600
    error_message = "rate_limit_period must be between 10 and 3600 seconds."
  }
}

variable "rate_limit_mitigation_timeout" {
  description = "Seconds a blocked client remains blocked."
  type        = number
  default     = 10

  validation {
    condition     = var.rate_limit_mitigation_timeout >= 10 && var.rate_limit_mitigation_timeout <= 86400
    error_message = "rate_limit_mitigation_timeout must be between 10 and 86400 seconds."
  }
}

variable "turnstile_preclearance_confirmed" {
  description = "Set to true only after the Turnstile widget is applied and the Worker is deployed with its site key and secret."
  type        = bool
  default     = false
}

variable "hsts_include_subdomains" {
  description = "Include subdomains in the zone HSTS policy. Enable only after confirming every subdomain serves HTTPS."
  type        = bool
  default     = false
}

variable "hsts_max_age" {
  description = "HSTS max-age in seconds. Preload requires at least 63072000 (two years)."
  type        = number
  default     = 31536000

  validation {
    condition     = var.hsts_max_age >= 0
    error_message = "hsts_max_age must be zero or greater."
  }
}

variable "hsts_preload" {
  description = "Submit the zone for HSTS preload. Requires hsts_max_age of at least two years."
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
  description = "Challenge clearance granted by the Turnstile widget."
  type        = string
  default     = "managed"

  validation {
    condition     = contains(["no_clearance", "jschallenge", "managed", "interactive"], var.turnstile_clearance_level)
    error_message = "turnstile_clearance_level must be no_clearance, jschallenge, managed, or interactive."
  }
}

variable "dns_records" {
  description = "Additional DNS records not owned by Wrangler, keyed by a stable name."
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

  validation {
    condition = alltrue([
      for record in values(var.dns_records) : !record.proxied || record.ttl == 1
    ])
    error_message = "Proxied DNS records must use ttl = 1 (automatic)."
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

variable "staging_allowed_emails" {
  description = "Email addresses allowed through the staging Cloudflare Access application."
  type        = list(string)

  validation {
    condition     = length(var.staging_allowed_emails) > 0 && length(var.staging_allowed_emails) <= 50
    error_message = "staging_allowed_emails must contain between 1 and 50 addresses on the Zero Trust Free plan."
  }

  validation {
    condition     = alltrue([for email in var.staging_allowed_emails : can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", email))])
    error_message = "staging_allowed_emails contains an invalid email address."
  }
}

variable "access_service_token_ids" {
  description = "Optional Access service token IDs allowed through the staging Service Auth policy."
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
