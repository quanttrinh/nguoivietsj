# Cloudflare infrastructure

Wrangler manages the Worker, bindings, routes, queues, and secrets. This
OpenTofu configuration manages the Cloudflare account and zone resources that
Wrangler cannot: TLS/HTTPS settings, WAF and rate limiting, Turnstile, DNS, and
the staging Cloudflare Access application. It also discovers the existing D1
databases and Workers KV namespaces so `bun scripts/infra.ts sync` can keep
`wrangler.jsonc` in sync.

## Current architecture

- **Production** (`nguoivietsj.ca`) is public. Staff authenticate in the app
  with Better Auth (email + password), and authorization uses the
  `users.role` column.
- **Staging** (`staging.nguoivietsj.ca`) is protected end-to-end by Cloudflare
  Access. There is no separate production Access application.
- Cloudflare Access in front of staging is an edge gate only. The Worker does
  not validate Access JWTs.
- D1, Workers KV, and Queues are created once with Wrangler or the dashboard,
  then discovered by OpenTofu. Terraform does not own their lifecycle, so an
  accidental `apply` cannot delete production data.

## What this creates

- Zone HTTPS/TLS settings:
  - Always Use HTTPS
  - Automatic HTTPS Rewrites
  - Minimum TLS 1.2
  - TLS 1.3
  - Strict SSL mode
  - HSTS through the zone `security_header` setting
  - Brotli through the zone `brotli` setting, with automatic Gzip fallback
- A Turnstile widget for the production and staging hostnames, with managed
  challenge clearance.
- A zone WAF custom rule that issues a **Managed Challenge** for public event
  registration requests matching `public_registration_path_pattern`.
- A zone rate-limiting rule that blocks bursts above 10 requests per 10 seconds
  per IP on registration, status and sign-in paths.
- Optional additional DNS records not owned by Wrangler custom domains.
- A self-hosted Cloudflare Access application for the entire
  `staging.nguoivietsj.ca` hostname.
- A staging Access allow policy, plus an optional Service Auth policy for
  Access service tokens used by CI or automated checks.
- Read-only discovery of the existing D1 databases and Workers KV namespaces,
  exported for `wrangler.jsonc` synchronization.

`public_registration_path_pattern` defaults to:

```hcl
"/api/events/*/registrations"
```

Production event pages remain public. Staging is always protected.

## Prerequisites

- OpenTofu 1.13.9 or newer (run `tofu init -upgrade` after upgrading).
- A Cloudflare API token with at least:
  - Zone → WAF → Edit
  - Zone → Zone Settings → Edit
  - Zone → Zone → Read
  - Zone → DNS → Edit, if managing `dns_records`
  - Account → Access: Apps and Policies → Edit
  - Account → Turnstile → Edit
  - Account → D1 → Read
  - Account → Workers KV Storage → Read
- A Google Cloud OAuth client and Gmail refresh token for the default sender
- Optionally, a Mailtrap API token for the fallback provider
- The GitHub Actions deploy uses the same token for Wrangler. Add these
  permissions for CI deploys:
  - Account → Workers Scripts → Edit
  - Account → D1 → Edit
  - Account → Workers KV Storage → Edit
  - Account → Queues → Edit
  - Zone → Workers Routes → Edit
- Use a separate bucket-scoped R2 token for the state backend. Do not grant the
  deploy token account-wide R2 access.
- The Cloudflare zone must be active and the custom domain must work.
- Zero Trust must be initialized for the account.
- The production and staging D1 databases and KV namespaces must already exist.
  See [One-time resource bootstrap](#one-time-resource-bootstrap).
- After applying, run `doppler run -c prd -- bun scripts/infra.ts sync` to update
  `wrangler.jsonc`, then store the Turnstile secret with Wrangler.
- Keep the WAF challenge gated until the Worker is deployed with the new
  Turnstile widget. The registration endpoint is called with `fetch`, so a
  challenge page would break the form.

Set the token in the environment. Do not commit it:

```sh
export CLOUDFLARE_API_TOKEN=...
```

## One-time resource bootstrap

Create the long-lived bindings before the first `tofu apply`:

```sh
bunx wrangler d1 create nguoivietsj-db
bunx wrangler d1 create nguoivietsj-event-engine-db
bunx wrangler d1 create nguoivietsj-staging-db
bunx wrangler d1 create nguoivietsj-staging-event-engine-db

bunx wrangler kv namespace create nguoivietsj-auth-kv
bunx wrangler kv namespace create nguoivietsj-staging-auth-kv

bunx wrangler queues create nguoivietsj-emails
bunx wrangler queues create nguoivietsj-emails-dlq
bunx wrangler queues create nguoivietsj-staging-emails
bunx wrangler queues create nguoivietsj-staging-emails-dlq
```

The D1 and KV names must match `local.databases` and `local.kv_namespaces` in
`main.tf`. Wrangler attaches queue consumers during `wrangler deploy`. Terraform
does not need to manage queues because Wrangler references them by name.

## Configure

```sh
cd infra/cloudflare
cp terraform.tfvars.example terraform.tfvars
```

Fill in at least:

```hcl
cloudflare_zone_id    = "..."
cloudflare_account_id = "..."
staging_hostname      = "staging.nguoivietsj.ca"

# Set true only after applying the widget and deploying the Worker with its
# site key and secret.
turnstile_preclearance_confirmed = false

hsts_include_subdomains = false

turnstile_widget_name     = "Event registration"
turnstile_widget_mode     = "managed"
turnstile_clearance_level = "managed"
turnstile_domains = [
  "nguoivietsj.ca",
  "staging.nguoivietsj.ca",
]

dns_records = {}

allowed_emails = [
  "organizer@example.com",
]
```

`staging_allowed_emails` overrides `allowed_emails` for staging only. There is
no production allow list because production does not use Cloudflare Access.

If you are upgrading an existing `terraform.tfvars`, remove the obsolete
`enable_staff_access`, `staff_primary_domain`, `staff_destinations`, and
`staff_allowed_emails` entries. The production Access application and its
policy are intentionally removed from this configuration.

`dns_records` is for records Wrangler does not own. Do not add the production or
staging custom-domain records here; Wrangler manages those. Add CAA, DMARC,
SPF, MX, or verification records only after checking for existing records:

```hcl
dns_records = {
  dmarc = {
    name    = "_dmarc"
    type    = "TXT"
    content = "v=DMARC1; p=none"
  }
}
```

To allow automated Access service tokens into staging, add their IDs:

```hcl
access_service_token_ids = [
  "00000000-0000-0000-0000-000000000000",
]
```

This creates a **Service Auth** policy (`decision = "non_identity"`). Access
service tokens do not work with an Allow policy containing only email rules.

`terraform.tfvars` is ignored by git.

The names in `local.databases` and `local.kv_namespaces` are the source of
truth; `bun scripts/infra.ts sync` writes the matching names and IDs into
`wrangler.jsonc`.

## Syncing wrangler.jsonc

After `tofu apply`, sync the non-secret values into `wrangler.jsonc`:

```sh
doppler run -c prd -- bun scripts/infra.ts sync
```

The script reads `tofu -chdir=infra/cloudflare output -json` and updates:

- `TURNSTILE_SITE_KEY` for production and staging
- `d1_databases[].database_name` and `database_id` for both environments
- `kv_namespaces[].id` for `AUTH_SESSION_KV` in both environments

It preserves comments, trailing commas, and formatting. Use the drift check in
CI:

```sh
doppler run -c prd -- bun scripts/infra.ts sync --check
```

Secrets are deliberately excluded. `scripts/infra.ts secrets` sends the
Worker secrets in one `wrangler secret bulk` request. It reads
`TURNSTILE_SECRET` from the OpenTofu output and the active email provider
secrets plus `BETTER_AUTH_SECRET` from Doppler:

```sh
doppler run -c prd -- bun scripts/infra.ts secrets
doppler run -c stg -- bun scripts/infra.ts secrets --env staging
```

Unlike `doppler secrets --json | wrangler secret bulk`, this command only sends
an explicit allowlist. The deploy configs also contain Cloudflare, R2, and
Terraform credentials that must not become Worker secrets.

The deploy workflow runs `scripts/infra.ts apply` for the target environment,
which executes `sync` and then `secrets` in one step.

## Turnstile widget

The widget is created by OpenTofu and its site key is synced into
`wrangler.jsonc` by `bun scripts/infra.ts sync`. The secret is exported as a sensitive
output and must be stored with Wrangler as shown above.

Deploy the Worker before setting `turnstile_preclearance_confirmed = true` and
applying the WAF challenge. The widget uses `clearance_level = "managed"` by
default, matching the WAF `managed_challenge` action.

If a Turnstile widget already exists, import it instead of creating a second
one:

```sh
tofu import cloudflare_turnstile_widget.registration \
  '<account-id>/<sitekey>'
```

## Email provider

Gmail is the default sender through the Gmail API and OAuth. Mailtrap remains
available as a fallback by setting `EMAIL_PROVIDER` to `mailtrap` in
`wrangler.jsonc`.

Mailtrap receives the same locally rendered subject, HTML, and text as Gmail.
The optional [`../mailtrap`](../mailtrap/README.md) root is retained for future
hosted-template work but is not used by the runtime provider.

See [`../../docs/gmail.md`](../../docs/gmail.md) for Gmail OAuth setup.

## Better Auth

Production and staging staff accounts use Better Auth. The Worker needs
`BETTER_AUTH_SECRET` and the `AUTH_SESSION_KV` binding:

```sh
bunx wrangler secret put BETTER_AUTH_SECRET
bunx wrangler secret put BETTER_AUTH_SECRET --env staging
```

The KV namespace IDs are synced from OpenTofu. There are no
`CF_ACCESS_TEAM_DOMAIN` or `CF_ACCESS_AUD` Worker variables. Staging Access is
terminated at the edge and does not require Worker-side JWT validation.

## HSTS

HSTS is managed by the zone `security_header` setting. The Worker does not emit
its own `Strict-Transport-Security` header.

`hsts_include_subdomains` defaults to `false`. Enable it only after confirming
every subdomain serves HTTPS. `preload` remains disabled.

## Additional DNS records

Only records not owned by Wrangler custom domains belong in `dns_records`.
Wrangler creates the production and staging custom-domain records.

If a record already exists, import it before applying:

```sh
tofu import 'cloudflare_dns_record.additional["dmarc"]' \
  '<zone-id>/<record-id>'
```

CAA records can be maintained by provider tooling but have had drift reports in
some Cloudflare provider versions. Verify the second plan after applying.

## State backend

`backend.tf` uses an R2 bucket named `opentofu` with the state key
`cloudflare/terraform.tfstate`. The account-specific R2 endpoint and
credentials come from the environment, so the account ID is not committed.

Create the bucket and a bucket-scoped R2 API token with **Object Read & Write**
permission. The bucket must exist before `tofu init`; OpenTofu cannot create
the bucket that stores its own state:

```sh
bunx wrangler r2 bucket create opentofu
```

Then export:

```sh
export AWS_ENDPOINT_URL_S3="https://<account-id>.r2.cloudflarestorage.com"
export AWS_ACCESS_KEY_ID="<r2-access-key-id>"
export AWS_SECRET_ACCESS_KEY="<r2-secret-access-key>"
```

`AWS_ENDPOINT_URL_S3` is the account-level R2 S3 endpoint only. Do not append
the bucket or state key; the bucket is set by `bucket` in `backend.tf`. With
`use_path_style = true`, requests become
`https://<account-id>.r2.cloudflarestorage.com/<bucket>/<key>`.

Initialize or migrate local state:

```sh
tofu init -migrate-state
```

The backend uses native S3 state locking through `use_lockfile`, which requires
OpenTofu 1.10 or newer. If you use a different bucket name, update
`backend.tf` and run `tofu init -reconfigure`.

Do not commit R2 credentials or state files. In CI these values come from
Doppler; locally, export them or run OpenTofu through `doppler run`.

## Staging Access

OpenTofu creates a self-hosted Access application whose domain is the entire
staging hostname. Everyone who needs staging must be in the allow list:

```hcl
allowed_emails = ["organizer@example.com"]
# or staging-specific:
staging_allowed_emails = ["staging-tester@example.com"]
```

The staging application is the only Access application managed here. Do **not**
create a production Access application; production staff sign in through the
app.

### Service tokens for CI

For automated staging checks, create an Access service token in Zero Trust and
add its ID:

```hcl
access_service_token_ids = ["<service-token-id>"]
```

Then send the token headers:

```sh
curl -sSI https://staging.nguoivietsj.ca/ \
  -H "CF-Access-Client-Id: $STAGING_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $STAGING_ACCESS_CLIENT_SECRET"
```

## GitHub Actions deployment

The Deploy workflow uses a scoped Cloudflare API token; no Cloudflare Tunnel is
required. A tunnel would only be needed to expose a private origin service that
Cloudflare cannot already reach. This project runs entirely on Workers, and
Terraform talks to the Cloudflare API and the R2 S3 endpoint over HTTPS.

Deployment secrets are read from Doppler at runtime. The workflow installs the
pinned Doppler CLI through aqua, then wraps each deploy command with `doppler
run`. Only the `DOPPLER_TOKEN` service tokens live in GitHub.

### Doppler setup

Create a Doppler project (for example `web`) with one config per
deployment target, such as `stg` and `prd`. Use config inheritance or referenced
secrets for values that are shared between environments.

Local development uses the `dev_personal` config selected by the repository's
`doppler.yaml`.

Create a read-only service token for each config and store it as a
`DOPPLER_TOKEN` GitHub secret:

| GitHub scope     | Doppler config | Purpose               |
| ---------------- | -------------- | --------------------- |
| Repository       | `dev_ci`       | CI dependency install |
| `staging` env    | `stg`          | Staging deploy        |
| `production` env | `prd`          | Production deploy     |

The repository-level `DOPPLER_TOKEN` is used by the CI workflow. GitHub
environment secrets take precedence over repository secrets, so the `staging`
and `production` environments use their own Doppler configs during deployment.
The `dev_ci` config only needs `NODE_AUTH_TOKEN` for `bun install`.

Both deploys are manual `workflow_dispatch` runs. Staging uses the `staging`
GitHub environment and deploys `main` by default, or an open same-repository PR
when the `pr` input is set. Production uses the `production` environment and
always deploys `main`. Add required reviewers to the `production` environment
if you want a deployment approval gate.

Generated OpenTofu secrets can optionally be mirrored back into Doppler. Set a
separate write-scoped `DOPPLER_WRITE_TOKEN` environment secret for `staging`
and `production`; then the deploy workflow runs:

```sh
bun scripts/infra.ts push-doppler --env staging
```

This currently mirrors `TURNSTILE_SECRET` into `stg` or `prd`. OpenTofu remains
the source of truth; Doppler holds the synced copy. Leave `DOPPLER_WRITE_TOKEN`
unset to skip the step and rely on `tofu output` during deploys.

The deploy configs (`stg` and `prd`) expect these Doppler secret names. `EMAIL_PROVIDER` in `wrangler.jsonc` selects `gmail` or `mailtrap`.

| Secret                         | Purpose                                               |
| ------------------------------ | ----------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`         | Wrangler, D1, KV, and OpenTofu API access             |
| `CLOUDFLARE_ACCOUNT_ID`        | Cloudflare account ID                                 |
| `AWS_ENDPOINT_URL_S3`          | `https://<account-id>.r2.cloudflarestorage.com`       |
| `AWS_ACCESS_KEY_ID`            | R2 state-bucket access key                            |
| `AWS_SECRET_ACCESS_KEY`        | R2 state-bucket secret key                            |
| `NODE_AUTH_TOKEN`              | GitHub Packages token for `bun install`               |
| `TERRAFORM_TFVARS`             | Contents of `infra/cloudflare/terraform.tfvars`       |
| `GMAIL_CLIENT_ID`              | Google OAuth client ID                                |
| `GMAIL_CLIENT_SECRET`          | Google OAuth client secret                            |
| `GMAIL_REFRESH_TOKEN`          | Gmail send-only refresh token                         |
| `MAILTRAP_API_TOKEN`           | Optional Mailtrap fallback token                      |
| `BETTER_AUTH_SECRET`           | Better Auth signing secret                            |
| `STAGING_ACCESS_CLIENT_ID`     | Optional Access service token for staging smoke tests |
| `STAGING_ACCESS_CLIENT_SECRET` | Optional Access service token secret                  |

The `AWS_*` names are required by OpenTofu's S3 backend. Cloudflare R2 exposes
an S3-compatible API, so these values are the R2 endpoint and R2 API token
credentials, not AWS credentials. `AWS_ENDPOINT_URL_S3` is
`https://<account-id>.r2.cloudflarestorage.com`.

`TERRAFORM_TFVARS` is a multi-line secret containing the same HCL you would put
in `infra/cloudflare/terraform.tfvars`. Because both deployment targets apply
the same OpenTofu state, the Terraform values must match across the `stg` and
`prd` configs. Inherit them from a shared config if you want a single source of
truth.

Use Doppler config inheritance for shared Terraform values, and secret
references for values derived from another secret or config.

### Workflow

The deploy workflow applies the Cloudflare OpenTofu root, optionally mirrors
generated secrets into Doppler, syncs `wrangler.jsonc` and the Worker secrets
with `scripts/infra.ts apply`, applies D1 migrations, and deploys the Worker.
Both environments are deployed manually. Staging accepts an optional PR
number; production always deploys `main`.

The Mailtrap root is optional and not part of the deploy workflow. The runtime
Mailtrap provider sends locally rendered content directly.

## Apply

First apply the zone settings, Turnstile widget, DNS records, rate limit, and
staging Access application with the WAF challenge gated off:

```sh
doppler run -c prd -- tofu init
doppler run -c prd -- tofu fmt
doppler run -c prd -- tofu plan
doppler run -c prd -- tofu apply
```

Then run the GitHub Actions `Deploy` workflow. It syncs the Worker vars, stores
secrets, applies D1 migrations, and deploys the Worker. Finally set
`turnstile_preclearance_confirmed = true` and apply the WAF challenge through
the workflow.

```sh
doppler run -c prd -- tofu plan
doppler run -c prd -- tofu apply
doppler run -c prd -- tofu plan
```

Run the final `tofu plan` again. If the second plan is not clean, review the
provider change before applying it.

## Existing rulesets

OpenTofu assumes full control of the zone entry-point rulesets for these
phases:

- `http_request_firewall_custom`
- `http_ratelimit`

If the zone already has rules in either phase, import the existing entry-point
ruleset before applying. Otherwise OpenTofu may replace the existing rules.

The Free plan allows only one rate-limiting rule. If the existing entry-point
ruleset already contains a rule, remove that rule or merge its behavior into
this configuration before applying.

Find the ruleset IDs:

```sh
curl -sS \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/rulesets/phases/http_request_firewall_custom/entrypoint"

curl -sS \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/rulesets/phases/http_ratelimit/entrypoint"
```

Import them:

```sh
tofu import 'cloudflare_ruleset.public_api_challenge[0]' \
  zones/<zone-id>/<ruleset-id>
tofu import cloudflare_ruleset.public_api_rate_limit \
  zones/<zone-id>/<ruleset-id>
```

For the existing staging Access application:

```sh
tofu import cloudflare_zero_trust_access_application.staging \
  accounts/<account-id>/<application-id>
```

Email and optional Service Auth policies are managed as standalone account-level
policies and referenced by ID.

## Verify

Staging should redirect to Cloudflare Access without a session:

```sh
curl -sSI https://staging.nguoivietsj.ca/
```

Production should remain reachable and serve the in-app login:

```sh
curl -sSI https://nguoivietsj.ca/
curl -sSI https://nguoivietsj.ca/en/login
```

Submit the registration form with a real Turnstile widget and confirm that the
POST reaches the Worker without a WAF challenge page. The WAF challenge is
evaluated before the Worker runs; a Turnstile token in the request body is not
visible to WAF unless managed-challenge clearance is active.

## Free-plan notes

- Zone WAF allows up to five custom rules.
- Free-plan rate limiting allows one rule, with a 10-second counting window and
  10-second mitigation period.
- Free-plan rate-limit expressions can use Path and Verified Bot fields. The
  rate-limit rule therefore matches the configured paths only; method filtering
  lives in the WAF custom rule.
- Cloudflare Access supports up to 50 users on Zero Trust Free. The email
  variables are capped at 50 accordingly.

## Service tokens

Access service tokens require a Service Auth policy and must be explicitly
listed by ID in `access_service_token_ids`. Supplying only the request headers
is not enough, even if the same token has access to another application.

The WAF challenge applies to public event registration requests matching
`public_registration_path_pattern`; automated tests that submit registrations must
use Turnstile pre-clearance or endpoints that are not protected by the challenge.

Keep OpenTofu state out of git. For shared environments, use the remote backend
described above.
