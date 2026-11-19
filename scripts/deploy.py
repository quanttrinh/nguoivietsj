#!/usr/bin/env python3
"""Deploy-time helpers for wrangler.json and Doppler.

Commands:
  check          Validate the selected Wrangler environment.
  hostname       Print the environment's custom-domain URL.
  render-config  Merge OpenTofu binding IDs into a generated Wrangler config.
  worker-secrets Filter Doppler JSON on stdin to wrangler.json secrets.required.
  turnstile      Print the Turnstile values as Doppler upload JSON.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

def load_config(config_path: Path) -> dict:
    try:
        return json.loads(config_path.read_text())
    except OSError as error:
        raise SystemExit(f"Could not read {config_path}: {error}") from error
    except json.JSONDecodeError as error:
        raise SystemExit(f"Invalid JSON in {config_path}: {error}") from error


def environment(config: dict, name: str) -> dict | None:
    if name == "production":
        return config
    return config.get("env", {}).get(name)


def output_value(outputs: dict, name: str) -> object:
    entry = outputs.get(name)
    return entry.get("value") if isinstance(entry, dict) and "value" in entry else entry


def render_config(env_name: str, config_path: Path, outputs_path: Path, out_path: Path | None) -> int:
    config = load_config(config_path)

    try:
        outputs = json.loads(outputs_path.read_text())
    except OSError as error:
        print(f"Could not read {outputs_path}: {error}", file=sys.stderr)
        return 1
    except json.JSONDecodeError as error:
        print(f"Invalid JSON in {outputs_path}: {error}", file=sys.stderr)
        return 1

    if env_name == "production":
        environment = config
    else:
        environment = config.get("env", {}).get(env_name)

    if environment is None:
        print(f"unknown environment: {env_name}", file=sys.stderr)
        return 1

    d1_outputs = output_value(outputs, "d1_databases")
    kv_outputs = output_value(outputs, "kv_namespaces")

    if not isinstance(d1_outputs, dict) or not isinstance(kv_outputs, dict):
        print("OpenTofu outputs are missing d1_databases or kv_namespaces.", file=sys.stderr)
        return 1

    for database in environment.get("d1_databases", []):
        key = f"{env_name}/{database.get('binding')}"
        value = d1_outputs.get(key)
        if not isinstance(value, dict) or not isinstance(value.get("id"), str):
            print(f"OpenTofu output has no D1 ID for {key}.", file=sys.stderr)
            return 1
        database["database_id"] = value["id"]
        if isinstance(value.get("name"), str):
            database["database_name"] = value["name"]

    for namespace in environment.get("kv_namespaces", []):
        key = f"{env_name}/{namespace.get('binding')}"
        value = kv_outputs.get(key)
        if not isinstance(value, dict) or not isinstance(value.get("id"), str):
            print(f"OpenTofu output has no KV ID for {key}.", file=sys.stderr)
            return 1
        namespace["id"] = value["id"]

    rendered = json.dumps(config, indent=2) + "\n"

    if out_path is None:
        sys.stdout.write(rendered)
    else:
        out_path.write_text(rendered)

    return 0


def check(name: str, config_path: Path) -> int:
    config = load_config(config_path)
    env = environment(config, name)

    if env is None:
        print(f"unknown environment: {name}", file=sys.stderr)
        return 1

    problems: list[str] = []
    vars = env.get("vars", {})

    for database in env.get("d1_databases", []):
        database_id = database.get("database_id", "")
        if not database_id or database_id.startswith("00000000-"):
            problems.append(f"{database.get('binding', 'D1')} still has a placeholder database_id")

    for namespace in env.get("kv_namespaces", []):
        namespace_id = namespace.get("id", "")
        if not namespace_id or namespace_id.startswith("00000000-"):
            problems.append(f"{namespace.get('binding', 'KV')} still has a placeholder KV id")

    provider = vars.get("EMAIL_PROVIDER", "gmail")
    if provider == "gmail":
        if not vars.get("GMAIL_SENDER_EMAIL", "").strip():
            problems.append("GMAIL_SENDER_EMAIL is empty; Gmail sending will be disabled")
    elif provider == "mailtrap":
        if not vars.get("MAILTRAP_FROM_EMAIL", "").strip():
            problems.append("MAILTRAP_FROM_EMAIL is empty; Mailtrap sending will be disabled")
    else:
        problems.append(f"EMAIL_PROVIDER must be gmail or mailtrap, got {provider}")

    if problems:
        print(f"Refusing to deploy {name} with incomplete configuration:", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        return 1

    print(f"Deploy configuration for {name} looks complete.")
    return 0


def hostname(name: str, config_path: Path) -> int:
    config = load_config(config_path)
    env = environment(config, name)

    if env is None:
        print(f"unknown environment: {name}", file=sys.stderr)
        return 1

    for route in env.get("routes", []):
        pattern = route.get("pattern", "").strip()
        if route.get("custom_domain") is True and pattern and "*" not in pattern:
            print(pattern if "://" in pattern else f"https://{pattern}")
            return 0

    print(f"No enabled custom-domain route for {name} in {config_path}.", file=sys.stderr)
    return 1


def worker_secrets(name: str, config_path: Path) -> int:
    config = load_config(config_path)
    env = environment(config, name)

    if env is None:
        print(f"unknown environment: {name}", file=sys.stderr)
        return 1

    required = env.get("secrets", {}).get("required", [])

    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as error:
        print(f"Invalid Doppler JSON on stdin: {error}", file=sys.stderr)
        return 1

    if not isinstance(payload, dict):
        print("Doppler JSON must be an object.", file=sys.stderr)
        return 1

    missing = [secret for secret in required if secret not in payload]
    if missing:
        print(
            f"Doppler is missing required Worker secrets for {name}: {', '.join(missing)}",
            file=sys.stderr,
        )
        return 1

    filtered = {}
    for secret in required:
        entry = payload[secret]
        filtered[secret] = entry.get("computed") if isinstance(entry, dict) else entry

    json.dump(filtered, sys.stdout, separators=(",", ":"))
    sys.stdout.write("\n")
    return 0


def turnstile(site: str, secret: str) -> int:
    if not site or not secret:
        print("Both the Turnstile site key and secret are required.", file=sys.stderr)
        return 1

    json.dump({"TURNSTILE_SITE_KEY": site, "TURNSTILE_SECRET": secret}, sys.stdout)
    sys.stdout.write("\n")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    config_parent = argparse.ArgumentParser(add_help=False)
    config_parent.add_argument(
        "--config",
        type=Path,
        required=True,
        help="Path to wrangler.json.",
    )

    for command in ("check", "worker-secrets", "hostname"):
        command_parser = subparsers.add_parser(command, parents=[config_parent])
        command_parser.add_argument("--env", required=True)

    render_parser = subparsers.add_parser("render-config", parents=[config_parent])
    render_parser.add_argument("--env", required=True)
    render_parser.add_argument("--outputs", type=Path, required=True)
    render_parser.add_argument("--out", type=Path)

    turnstile_parser = subparsers.add_parser("turnstile")
    turnstile_parser.add_argument("--site", required=True)
    turnstile_parser.add_argument("--secret", required=True)

    args = parser.parse_args()

    if args.command == "check":
        return check(args.env, args.config)
    if args.command == "worker-secrets":
        return worker_secrets(args.env, args.config)
    if args.command == "hostname":
        return hostname(args.env, args.config)
    if args.command == "render-config":
        return render_config(args.env, args.config, args.outputs, args.out)
    if args.command == "turnstile":
        return turnstile(args.site, args.secret)

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
