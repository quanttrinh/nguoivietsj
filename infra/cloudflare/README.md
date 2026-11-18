# Cloudflare infrastructure

This OpenTofu root manages the Cloudflare resources that Wrangler cannot:
zone-wide TLS/HSTS/WAF/rate limiting, the Turnstile widget, DNS records, the
staging Cloudflare Access application, and read-only discovery of the D1
databases and KV namespaces declared in `wrangler.json`.

Wrangler still manages the Worker, assets, routes, D1/KV/queue bindings,
rate-limit bindings, and Worker secrets. Terraform never owns the lifecycle of
the bindings, so an accidental apply cannot delete production data.

Production does not use Cloudflare Access; staff sign in through Better Auth.

## What this creates

- Zone HTTPS/TLS settings:
  - Always Use HTTPS
  - Automatic HTTPS Rewrites
  - Minimum TLS 1.2
  - TLS 1.3
  - Strict SSL mode
  - Brotli
- HSTS through the zone `security_header` setting.
- A Turnstile widget for the apex and staging hostnames.
- A zone WAF custom rule that issues a **Managed Challenge** for public event
  registration requests matching `public_registration_path_pattern`.
- A zone rate-limiting rule that blocks bursts above the configured threshold on
  registration, status, and sign-in paths.
- Optional additional DNS records not owned by Wrangler custom domains.
- A staging Cloudflare Access application, allow policy, and optional Service
  Auth policy.
- Read-only discovery of the existing D1 databases and KV namespaces.

## Prerequisites

- OpenTofu 1.13.9 or newer (the aqua pin).
- A Cloudflare API token with at least:
  - Zone → WAF → Edit
  - Zone → Zone Settings → Edit
  - Zone → Zone → Read
  - Zone → DNS → Edit, if managing `dns_records`
  - Account → Access: Apps and Policies → Edit
  - Account → Turnstile → Edit
  - Account → D1 → Read
  - Account → Workers KV Storage → Read
- The zone must be active and the custom domain must work.
- Zero Trust must be initialized for the account.
- Production and staging D1 databases and KV namespaces must already exist.
  See [One-time resource bootstrap](#one-time-resource-bootstrap).
- R2 state credentials, as described in [State backend](#state-backend).

## Configure

```sh
cp infra/cloudflare/terraform.tfvars.example infra/cloudflare/terraform.tfvars
```

Required values:

```hcl
cloudflare_zone_id    = "..."
cloudflare_account_id = "..."
allowed_emails        = ["organizer@example.com"]
```

Zone name, staging hostname, and the D1/KV bindings are read from
`wrangler.json`. Define a binding once there; Terraform follows it. The Turnstile
domain list is derived from the production and staging custom-domain routes.

See [`terraform.tfvars.example`](./terraform.tfvars.example) for the WAF path,
rate-limit, HSTS, Turnstile, and DNS variables.

`hsts_include_subdomains` defaults to `false`. `hsts_preload` requires a max age
of at least two years; the resource rejects an invalid combination.

`terraform.tfvars` is ignored by git. In CI the contents are stored as the
`TERRAFORM_TFVARS` secret in the `prd` Doppler config.

## Turnstile and WAF gating

The registration endpoint is called with `fetch`, so a challenge page would
break the form. Apply in this order:

1. Apply with `turnstile_preclearance_confirmed = false`.
2. Deploy the Worker through the `Deploy` workflow, which publishes the site key
   and secret to Doppler and then to the Worker.
3. Submit a real registration and confirm the POST reaches the Worker.
4. Set `turnstile_preclearance_confirmed = true` and apply again to create the
   WAF managed-challenge rule.

If a Turnstile widget already exists, import it instead of creating another:

```sh
tofu -chdir=infra/cloudflare import cloudflare_turnstile_widget.registration \
  '<account-id>/<sitekey>'
```

## Staging Access

The Access application covers the entire staging hostname:

```hcl
allowed_emails = ["organizer@example.com"]
# or staging-specific:
staging_allowed_emails = ["staging-tester@example.com"]
```

`staging_allowed_emails` overrides `allowed_emails` for staging only. There is no
production allow list here.

For automated staging checks, create an Access service token in Zero Trust and
add its ID:

```hcl
access_service_token_ids = ["<service-token-id>"]
```

This creates a **Service Auth** policy (`decision = "non_identity"`). Service
tokens do not work with an Allow policy containing only email rules. Send the
token headers as usual:

```sh
curl -sSI https://staging.nguoivietsj.ca/ \
  -H "CF-Access-Client-Id: $STAGING_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $STAGING_ACCESS_CLIENT_SECRET"
```

If the Access application already exists, import it:

```sh
tofu -chdir=infra/cloudflare import \
  cloudflare_zero_trust_access_application.staging \
  accounts/<account-id>/<application-id>
```

## Existing rulesets

This root assumes full control of the zone entry-point rulesets for:

- `http_request_firewall_custom`
- `http_ratelimit`

If the zone already has rules in either phase, import the existing entry-point
ruleset before applying. Otherwise OpenTofu may replace existing rules.

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
tofu -chdir=infra/cloudflare import 'cloudflare_ruleset.public_api_challenge[0]' \
  zones/<zone-id>/<ruleset-id>
tofu -chdir=infra/cloudflare import cloudflare_ruleset.public_api_rate_limit \
  zones/<zone-id>/<ruleset-id>
```

The Free plan allows one rate-limiting rule. If the existing entry-point ruleset
already contains a rule, merge or remove it first.

## DNS records

`dns_records` is only for records Wrangler does not own. Do not add the
production or staging custom-domain records here.

```hcl
dns_records = {
  dmarc = {
    name    = "_dmarc"
    type    = "TXT"
    content = "v=DMARC1; p=none"
  }
}
```

Proxied records must use `ttl = 1` (automatic). If a record already exists,
import it first:

```sh
tofu -chdir=infra/cloudflare import 'cloudflare_dns_record.additional["dmarc"]' \
  '<zone-id>/<record-id>'
```

CAA records have had drift reports in some Cloudflare provider versions. Verify
the second plan after applying.

## D1 and KV discovery

The root reads the D1 bindings by `database_name` and derives KV titles from the
Wrangler convention:

```text
<worker-name>-<binding lowercased, _ replaced by ->
```

For example, `AUTH_SESSION_KV` on `nguoivietsj` becomes
`nguoivietsj-auth-session-kv`.

It does not manage their lifecycle. If a binding is missing, the plan fails.

`deploy.yml` renders a generated Wrangler config from these outputs before
building, so IDs are not stored in source.

## Workflows

- `ci.yml` runs `tofu fmt` and `tofu validate` with no backend.
- `infra.yml` plans on infrastructure pull requests and on `main`, then applies
  from `main` through the protected `production` environment.
- `deploy.yml` never applies Terraform. It publishes the generated Turnstile
  values to Doppler, pushes Worker secrets, applies D1 migrations, and deploys
  the Worker.

Staging deployments, including PR deployments, cannot change infrastructure.

## One-time resource bootstrap

```sh
bunx wrangler d1 create nguoivietsj-db
bunx wrangler d1 create nguoivietsj-event-engine-db
bunx wrangler d1 create nguoivietsj-staging-db
bunx wrangler d1 create nguoivietsj-staging-event-engine-db

bunx wrangler kv namespace create nguoivietsj-auth-session-kv
bunx wrangler kv namespace create nguoivietsj-staging-auth-session-kv

bunx wrangler queues create nguoivietsj-emails
bunx wrangler queues create nguoivietsj-emails-dlq
bunx wrangler queues create nguoivietsj-staging-emails
bunx wrangler queues create nguoivietsj-staging-emails-dlq
```

Terraform discovers the D1 databases by name and the KV namespaces by the
derived title. The deploy workflow renders a generated Wrangler config with the
resolved IDs before building; source `wrangler.json` contains no binding IDs.
Wrangler attaches queue consumers during `wrangler deploy`.

## State backend

`backend.tf` uses the `opentofu` R2 bucket and the
`cloudflare/terraform.tfstate` key. Create the bucket and a bucket-scoped R2 API
token with **Object Read & Write** permission:

```sh
bunx wrangler r2 bucket create opentofu
```

Export the R2 S3 endpoint and credentials:

```sh
export AWS_ENDPOINT_URL_S3="https://<account-id>.r2.cloudflarestorage.com"
export AWS_ACCESS_KEY_ID="<r2-access-key-id>"
export AWS_SECRET_ACCESS_KEY="<r2-secret-access-key>"
```

`AWS_ENDPOINT_URL_S3` is the account-level endpoint only. Do not append the
bucket or state key.

The backend uses native S3 locking through `use_lockfile`, which requires
OpenTofu 1.10 or newer.

## Doppler setup

Deployment secrets are read from Doppler at runtime. The deploy workflow
installs the pinned Doppler CLI through aqua and wraps each command with
`doppler run`. GitHub stores a read-only `DOPPLER_READ_TOKEN` and a separate
read-write `DOPPLER_WRITE_TOKEN`; the CLI receives the active one as
`DOPPLER_TOKEN`. Both are step-scoped: only steps that invoke Doppler receive a
token, and only the Turnstile publish step receives write access.

| GitHub scope             | Doppler config | Doppler tokens                                 |
| ------------------------ | -------------- | ---------------------------------------------- |
| Repository               | `dev_ci`       | `DOPPLER_READ_TOKEN` (CI installs)             |
| `staging` environment    | `stg`          | `DOPPLER_READ_TOKEN` and `DOPPLER_WRITE_TOKEN` |
| `production` environment | `prd`          | `DOPPLER_READ_TOKEN` and `DOPPLER_WRITE_TOKEN` |

The `prd` config stores the `TERRAFORM_TFVARS` used by this root. `stg` does not
need a copy because there is only one infrastructure root.

| Secret                                                            | Purpose                                          |
| ----------------------------------------------------------------- | ------------------------------------------------ |
| `CLOUDFLARE_API_TOKEN`                                            | Wrangler, D1, KV, and OpenTofu API access        |
| `CLOUDFLARE_ACCOUNT_ID`                                           | Cloudflare account ID                            |
| `AWS_ENDPOINT_URL_S3`                                             | R2 S3 endpoint for state                         |
| `AWS_ACCESS_KEY_ID`                                               | R2 state-bucket access key                       |
| `AWS_SECRET_ACCESS_KEY`                                           | R2 state-bucket secret key                       |
| `TERRAFORM_TFVARS`                                                | Contents of `infra/cloudflare/terraform.tfvars`  |
| `NODE_AUTH_TOKEN`                                                 | GitHub Packages token for `bun install`          |
| `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` / `GMAIL_REFRESH_TOKEN` | Gmail sender                                     |
| `MAILTRAP_API_TOKEN`                                              | Optional Mailtrap fallback                       |
| `BETTER_AUTH_SECRET`                                              | Better Auth signing secret                       |
| `STAGING_ACCESS_CLIENT_ID` / `STAGING_ACCESS_CLIENT_SECRET`       | Optional staging smoke tests                     |
| `DOPPLER_READ_TOKEN`                                              | Read-only token for installs, plans, and deploys |
| `DOPPLER_WRITE_TOKEN`                                             | Read-write token for publishing Turnstile values |

The deploy workflow filters Doppler secrets using `wrangler.json`
`secrets.required`, so Cloudflare, R2, and Terraform credentials are never sent
to the Worker.

## Apply

```sh
doppler run -c prd -- tofu -chdir=infra/cloudflare init -input=false
doppler run -c prd -- tofu -chdir=infra/cloudflare plan -input=false -out=cloudflare.tfplan
doppler run -c prd -- tofu -chdir=infra/cloudflare apply -input=false cloudflare.tfplan
```

The GitHub Actions `Infrastructure` workflow performs this from `main`; the
`Deploy` workflow only reads the outputs.

## Free-plan notes

- Zone WAF allows up to five custom rules.
- Free-plan rate limiting allows one rule with a 10-second counting window and a
  10-second mitigation period.
- Free-plan rate-limit expressions can use Path and Verified Bot fields. Method
  filtering therefore lives in the WAF custom rule.
- Cloudflare Access supports up to 50 users on Zero Trust Free. Email variables
  are capped at 50 accordingly.

## Verify

```sh
curl -sSI https://nguoivietsj.ca/
curl -sSI https://nguoivietsj.ca/en/login
curl -sSI https://staging.nguoivietsj.ca/
```

Staging should redirect to Cloudflare Access without a session. After enabling
the WAF challenge, submit a registration with a real Turnstile widget and
confirm the POST reaches the Worker.
