# Cloudflare infrastructure

This OpenTofu root manages the Cloudflare resources that Wrangler cannot:
zone-wide TLS/HSTS/WAF/rate limiting, the Turnstile widget, DNS records, the
staging Cloudflare Access application, and the D1 databases and KV namespaces
declared in `wrangler.json`.

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
- A zone WAF custom rule that issues a **Managed Challenge** for POST requests
  matching `challenge_path_patterns`.
- A zone rate-limiting rule that blocks bursts above the configured threshold on
  the paths in `rate_limit_paths`.
- Optional additional DNS records not owned by Wrangler custom domains.
- A staging Cloudflare Access application, allow policy, and optional Service
  Auth policy.
- The D1 databases and KV namespaces declared in `wrangler.json`, protected by
  `prevent_destroy`.

## Prerequisites

- OpenTofu 1.13.9 or newer (the aqua pin).
- A Cloudflare API token with at least:
  - Zone → WAF → Edit
  - Zone → Zone Settings → Edit
  - Zone → Zone → Read
  - Zone → DNS → Edit, if managing `dns_records`
  - Account → Access: Apps and Policies → Edit
  - Account → Turnstile → Edit
  - Account → D1 → Edit
  - Account → Workers KV Storage → Edit
  - Account → Queues → Edit
- The zone must be active and the custom domain must work.
- Zero Trust must be initialized for the account.
- R2 state credentials, as described in [State backend](#state-backend).

## Configure

```sh
cp infra/cloudflare/terraform.tfvars.example infra/cloudflare/terraform.tfvars
```

Required values:

```hcl
staging_allowed_emails = ["organizer@example.com"]
challenge_path_patterns = ["/api/events/*/registrations"]
rate_limit_paths = [
  "/api/events/*/registrations",
  "/api/events/status/*",
  "/api/auth/sign-in/*",
]
```

Zone name and staging hostname are read from the `wrangler.json` routes. The D1
databases, KV namespaces, and queues are created from the bindings declared
there; define a binding once and Terraform follows it. The Turnstile
domain list is derived from the production and staging custom-domain routes.

See [`terraform.tfvars.example`](./terraform.tfvars.example) for the WAF path,
rate-limit, HSTS, Turnstile, and DNS variables.

`hsts_include_subdomains` defaults to `false`. `hsts_preload` requires a max age
of at least two years; the resource rejects an invalid combination.

`terraform.tfvars` is ignored by git. In CI the same values are stored as the
`TERRAFORM_TFVARS` secret in the `prd` Doppler config as a JSON object; the
workflow writes it to `terraform.tfvars.json` before planning.

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
staging_allowed_emails = ["organizer@example.com"]
```

`staging_allowed_emails` is the whole Access allow list. There is no production
allow list here.

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
tofu -chdir=infra/cloudflare import 'cloudflare_ruleset.challenge[0]' \
  zones/<zone-id>/<ruleset-id>
tofu -chdir=infra/cloudflare import cloudflare_ruleset.rate_limit \
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

## Data store ownership

The D1 databases, KV namespaces, and queues are created by this root from the
bindings in `wrangler.json`, with `prevent_destroy` so removing a binding or
running a destroy plan cannot delete data. KV titles follow the Wrangler
convention:

```text
<worker-name>-<binding lowercased, _ replaced by ->
```

For example, `AUTH_SESSION_KV` on `nguoivietsj` becomes
`nguoivietsj-auth-session-kv`.

`deploy.yml` renders a generated Wrangler config from the D1 and KV outputs
before building, so IDs are not stored in source. Wrangler attaches queue
consumers during `wrangler deploy`.

## Workflows

- `ci.yml` runs `tofu fmt` and `tofu validate` with no backend.
- `infra.yml` plans on infrastructure pull requests and on `main`, then applies
  from `main` through the protected `production` environment.
- `deploy.yml` never applies Terraform. It publishes the generated Turnstile
  values to Doppler, pushes Worker secrets, applies D1 migrations, and deploys
  the Worker.

Staging deployments, including PR deployments, cannot change infrastructure.

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
