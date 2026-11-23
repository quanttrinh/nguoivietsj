# Cloudflare infrastructure

OpenTofu root for the Cloudflare resources Wrangler does not own: zone
TLS/HSTS/WAF and rate limiting, bot and AI traffic controls, DNSSEC, Turnstile,
additional DNS records, staging Access, and the D1/KV/queue bindings declared in
`wrangler.json`. Email templates live in the separate
[Mailtrap root](../mailtrap/README.md).

Wrangler owns the Worker, assets, routes, bindings, and Worker secrets.
Resources here use `prevent_destroy`, so a plan cannot delete stored data.

## Configuration

Copy `terraform.tfvars.example` to `terraform.tfvars` (gitignored) and set the
account-specific values. Zone and hostnames come from the `wrangler.json`
routes; the example documents the policy variables.

In CI the same values are injected from Doppler. Credentials, IDs, and state
backend settings are supplied at runtime and are not stored in the repository.

## Workflows

- `ci.yml` runs format and validation checks.
- `infra.yml` is dispatch-only: it plans and applies from `main` under the
  protected `production` environment. Command output is kept off the CI log and
  uploaded to a private R2 bucket for debugging.
- `deploy.yml` reads the outputs and deploys the Worker; it never applies
  Terraform, and staging deploys cannot change infrastructure.

## Plan and apply locally

```sh
doppler run --config infra -- tofu -chdir=infra/cloudflare init -input=false
doppler run --config infra -- tofu -chdir=infra/cloudflare plan -input=false -out=cloudflare.tfplan
doppler run --config infra -- tofu -chdir=infra/cloudflare apply -input=false cloudflare.tfplan
```

## Turnstile gating

Apply first with the WAF challenge disabled, deploy the Worker, verify a real
registration, then enable the challenge with the setting documented in
`terraform.tfvars.example`.

## Repository hygiene

Never commit `terraform.tfvars`, generated Wrangler configs, plan files, state,
or logs. Infrastructure IDs and secrets belong in the runtime secret store, not
in source control.
