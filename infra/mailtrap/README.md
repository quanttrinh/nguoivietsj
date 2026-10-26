# Mailtrap infrastructure

This OpenTofu root is retained for future hosted-template work. The runtime
Gmail and Mailtrap providers render templates locally and do not read these
template UUIDs.

## Requirements

- OpenTofu 1.13.9 or newer
- `MAILTRAP_API_TOKEN` with permission to read and write email templates
- R2 state credentials, matching the Cloudflare infrastructure setup

## Apply

```sh
doppler run -c prd -- tofu -chdir=infra/mailtrap init -upgrade
doppler run -c prd -- tofu -chdir=infra/mailtrap apply
```

## Templates

Templates live in `src/events/services/email/templates/` and are shared with the
event email renderer. Each template has an HTML and plain-text body. Both
providers use inline HTML/CSS for email-client compatibility.

If templates already exist in the Mailtrap account, import them before the
first apply:

```sh
tofu -chdir=infra/mailtrap import mailtrap_email_template.registration_received <template-id>
```
