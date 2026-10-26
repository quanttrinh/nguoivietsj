# R2-backed OpenTofu state.
#
# The R2 S3 endpoint is supplied at runtime so the account ID is not stored
# here:
#   export AWS_ENDPOINT_URL_S3="https://<account-id>.r2.cloudflarestorage.com"
#   export AWS_ACCESS_KEY_ID="..."
#   export AWS_SECRET_ACCESS_KEY="..."
#
# The R2 API token must have Object Read & Write access to this bucket.
terraform {
  backend "s3" {
    bucket                      = "nguoivietsj-tofu-state"
    key                         = "cloudflare/terraform.tfstate"
    region                      = "auto"
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
    use_path_style              = true
    use_lockfile                = true
  }
}
