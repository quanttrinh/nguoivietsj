# Cloudflare Access, WAF, and Turnstile

Wrangler manages the Worker, bindings, and routes. It cannot manage
zone WAF rules or Cloudflare Access applications, so those live here as
OpenTofu configuration.

## What this creates

- Zone HTTPS/TLS settings:
  - Always Use HTTPS
  - Automatic HTTPS Rewrites
  - Minimum TLS 1.2
  - TLS 1.3
  - Strict SSL mode
  - HSTS through the zone `security_header` setting
- A Turnstile widget for the production and staging hostnames, with managed
  challenge clearance.
- A zone WAF custom rule that issues a **Managed Challenge** for public event
  registration requests matching `public_registration_path_regex`.
- A zone rate-limiting rule that blocks bursts above 10 requests per 10 seconds
  per IP on the same paths.
- Optional additional DNS records not owned by Wrangler custom domains.
- A self-hosted Cloudflare Access application for `staging.nguoivietsj.ca`.
- A production admin Access application covering:
  - `nguoivietsj.ca/*/events/admin*`
  - `nguoivietsj.ca/api/events/admin/*`
- Standalone Access allow policies for each application, plus an optional shared
  Service Auth policy for Access service tokens.
- Read-only discovery of the existing D1 databases and Zero Trust organization,
  exported for `wrangler.jsonc` synchronization.

`public_registration_path_regex` defaults to:

```hcl
"^/api/events/public/events/[^/]+/registrations$"
```

Production event pages remain public. Staging is always protected. Admin Access
is enabled by default because the in-app login has been removed; set
`enable_staff_access = false` only if you are deliberately leaving admin routes
unavailable.

## Prerequisites

- OpenTofu 1.13.2 or newer (run `tofu init -upgrade` after upgrading).
- A Cloudflare API token with at least:
  - Zone → WAF → Edit
  - Zone → Zone → Read
  - Account → Access: Apps and Policies → Edit
  - Account → Access: Organizations, Identity Providers, and Groups → Read
  - Account → Turnstile → Edit
  - Account → D1 → Read
- The Cloudflare zone must be active and the custom domain must work.
- Zero Trust must be initialized for the account.
- After applying, run `bun run cf:sync` to update `wrangler.jsonc`, then store
  the Turnstile secret with Wrangler.
- Keep the WAF challenge gated until the Worker is deployed with the new
  Turnstile widget. The registration endpoint is called with `fetch`, so a
  challenge page would break the form.

Set the token in the environment. Do not commit it:

```sh
export CLOUDFLARE_API_TOKEN=...
```

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

`staff_destinations` must include the event-engine admin page and API paths.
Existing `terraform.tfvars` files need these entries updated manually because
defaults do not override an explicit list.

`allowed_emails` is the default list for both applications. Use
`staging_allowed_emails` or `staff_allowed_emails` to override one environment
without changing the other.

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

To allow automated Access service tokens, add their IDs:

```hcl
access_service_token_ids = [
  "00000000-0000-0000-0000-000000000000",
]
```

This creates a **Service Auth** policy (`decision = "non_identity"`). Access
service tokens do not work with an Allow policy containing only email rules.

`terraform.tfvars` is ignored by git.

The D1 names in `local.databases` are the source of truth; `bun run cf:sync`
writes both the names and UUIDs into `wrangler.jsonc`.

## Syncing wrangler.jsonc

After `tofu apply`, sync the non-secret values into `wrangler.jsonc`:

```sh
bun run cf:sync
```

The script reads `tofu -chdir=infra/cloudflare output -json` and updates:

- `TURNSTILE_SITE_KEY` for production and staging
- `CF_ACCESS_TEAM_DOMAIN` for production and staging
- `CF_ACCESS_AUD` for production and staging
- `d1_databases[].database_name` and `database_id` for both environments

It preserves comments, trailing commas, and formatting. Use the drift check in
CI:

```sh
bun run cf:sync:check
```

Secrets are deliberately excluded. Store them with Wrangler:

```sh
tofu output -raw turnstile_secret | bunx wrangler secret put TURNSTILE_SECRET
tofu output -raw turnstile_secret | bunx wrangler secret put TURNSTILE_SECRET --env staging
```

## Turnstile widget

The widget is created by OpenTofu and its site key is synced into
`wrangler.jsonc` by `bun run cf:sync`. The secret is exported as a sensitive
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

## Mailtrap email

The Worker sends registration and payment-confirmation email through Mailtrap.
Set the sender variables in `wrangler.jsonc` and store the API token with
Wrangler:

```sh
bunx wrangler secret put MAILTRAP_API_TOKEN
bunx wrangler secret put MAILTRAP_API_TOKEN --env staging
```

Verify `MAILTRAP_FROM_EMAIL` in Mailtrap before deploying. `MAILTRAP_API_URL`
defaults to `https://send.api.mailtrap.io/api/send`.

## HSTS

HSTS is managed by the zone `security_header` setting. The Worker no longer
emits its own `Strict-Transport-Security` header, avoiding duplicate headers.

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

`backend.tf` uses an R2 bucket named `nguoivietsj-tofu-state` with the state key
`cloudflare/terraform.tfstate`. The account-specific R2 endpoint and
credentials come from the environment, so the account ID is not committed.

Create the bucket and a bucket-scoped R2 API token with **Object Read & Write**
permission:

```sh
bunx wrangler r2 bucket create nguoivietsj-tofu-state
```

Then export:

```sh
export AWS_ENDPOINT_URL_S3="https://<account-id>.r2.cloudflarestorage.com"
export AWS_ACCESS_KEY_ID="<r2-access-key-id>"
export AWS_SECRET_ACCESS_KEY="<r2-secret-access-key>"
```

Initialize or migrate local state:

```sh
tofu init -migrate-state
```

The backend uses native S3 state locking through `use_lockfile`, which requires
OpenTofu 1.10 or newer. If you use a different bucket name, update
`backend.tf` and run `tofu init -reconfigure`.

Do not commit R2 credentials or state files.

Staff/admin Access is enabled by default:

```hcl
enable_staff_access = true
```

After applying, configure `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` for the
Worker as described below.

## Staff Access without a second login

The Worker validates Cloudflare Access JWTs for event-engine staff/admin routes
when Access is configured. Both the `staff` and `admin` roles in the users table
are accepted.

After applying Access, run `bun run cf:sync` to copy the team domain and AUD
tags into `wrangler.jsonc`:

```jsonc
"CF_ACCESS_TEAM_DOMAIN": "https://<team-name>.cloudflareaccess.com",
"CF_ACCESS_AUD": "<staff-or-staging-aud>"
```

- Production uses `staff_access_aud` when `enable_staff_access = true`.
- Staging uses `staging_access_aud`, because the staging Access app protects
  the entire staging hostname.

With both values set:

- Event-engine admin pages and admin APIs require a valid Access JWT.
- The JWT email is matched to a row in `users` with either the `staff` or
  `admin` role.
- There is no in-app login; staff authentication is Access-only.
- Missing, invalid, or unauthorized Access identities receive `403`.
- Logout redirects to Cloudflare Access logout.
- If either value is empty in a production build, protected routes fail closed
  with `403`. `DEV_STAFF_EMAIL` is the local-development-only fallback.

The Access JWT is signature-, issuer-, audience-, and expiry-validated. It is
used for authentication only; the `staff` / `admin` role check remains the
authorization layer.

## Access policy resources

Access policies are managed as standalone
`cloudflare_zero_trust_access_policy` resources and referenced from each
application by ID and precedence.

If you are upgrading an existing state that used inline application policies,
the first plan will create account-level policies and re-point the applications
to them. App-scoped policy IDs cannot be imported as account-level policies, so
expect the old inline policies to be replaced. Review the plan before applying.

## Apply

First apply the zone settings, Turnstile widget, DNS records, rate limit, and
Access applications with the WAF challenge gated off:

```sh
tofu init
tofu fmt
tofu plan
tofu apply
```

Then sync the Worker vars and store the Turnstile secret, deploy the Worker,
and finally set `turnstile_preclearance_confirmed = true` and apply the WAF
challenge:

```sh
bun run cf:sync
tofu output -raw turnstile_secret | bunx wrangler secret put TURNSTILE_SECRET
tofu output -raw turnstile_secret | bunx wrangler secret put TURNSTILE_SECRET --env staging
bun run deploy
bun run deploy:staging
```

```sh
tofu plan
tofu apply
tofu plan
```

Run the final `tofu plan` again. Cloudflare provider v5 has had reports of
inline Access policy drift; if the second plan is not clean, move the policies
to separate `cloudflare_zero_trust_access_policy` resources and reference
their IDs from the applications.

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

For existing Access applications:

```sh
tofu import cloudflare_zero_trust_access_application.staging \
  accounts/<account-id>/<application-id>

tofu import 'cloudflare_zero_trust_access_application.staff[0]' \
  accounts/<account-id>/<application-id>
```

Email and optional Service Auth policies are managed inline on each application.

## Verify

Staging should redirect to Cloudflare Access without a session:

```sh
curl -sSI https://staging.nguoivietsj.ca/
```

Production should remain reachable:

```sh
curl -sSI https://nguoivietsj.ca/
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
`public_registration_path_regex`; automated tests that submit registrations must
use Turnstile pre-clearance or endpoints that are not protected by the challenge.

Keep OpenTofu state out of git. For shared environments, use the remote backend
described above.
