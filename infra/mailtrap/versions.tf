terraform {
  required_version = ">= 1.13.9"

  required_providers {
    mailtrap = {
      source  = "mailtrap/mailtrap"
      version = "0.1.3"
    }
  }
}

# Uses MAILTRAP_API_TOKEN from the environment (supported natively by the
# provider), so the token never needs a variable or a tfvars entry.
provider "mailtrap" {}
