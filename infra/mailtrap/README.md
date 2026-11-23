# Mailtrap infrastructure

OpenTofu root for the email templates used by the Worker. It is separate from
the [Cloudflare root](../cloudflare/README.md) so each provider has its own
state.

## Template ownership

`wrangler.json` is the source of truth for the template set: every
`MAILTRAP_TEMPLATE_*` var in both environments becomes one managed template.
`main.tf` derives its resource set from those names and fails validation if the
metadata drifts.

HTML and plain-text bodies live in [`templates/`](./templates/) and are read by
`main.tf`. Edit them here and apply — do not edit templates in the Mailtrap UI.
Resources use `prevent_destroy`, so removing or renaming a var cannot delete a
live template.

To add a template: declare its `MAILTRAP_TEMPLATE_*` var in both `wrangler.json`
environments, add metadata in `main.tf`, and add the `.html`/`.txt` bodies in
`templates/`. The deploy pipeline needs no change; the UUID flows through the
`mailtrap_templates` output into the generated Wrangler config.

## Credentials

The provider token and state backend settings are supplied at runtime from the
Doppler `infra` config; the Worker receives the stage sending token through the
deploy workflow. Sending-domain DNS records are managed by the Cloudflare root.
Nothing sensitive is stored in the repository.

## Commands

```sh
doppler run --config infra -- tofu -chdir=infra/mailtrap init -input=false
doppler run --config infra -- tofu -chdir=infra/mailtrap plan -input=false
doppler run --config infra -- tofu -chdir=infra/mailtrap apply -input=false
```

Never commit plan files, state, or generated configuration.
