terraform {
  required_version = ">= 1.13.2"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.28.1"
    }
  }
}

# Uses CLOUDFLARE_API_TOKEN from the environment.
provider "cloudflare" {}
