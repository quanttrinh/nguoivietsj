terraform {
  required_version = ">= 1.13.9"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "5.29.0"
    }
  }
}

# Uses CLOUDFLARE_API_TOKEN from the environment.
provider "cloudflare" {}
