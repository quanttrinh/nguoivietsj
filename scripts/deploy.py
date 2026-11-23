#!/usr/bin/env python3
"""Deploy-time helpers for wrangler.json and Doppler.

Commands:
  check          Validate the selected Wrangler environment.
  hostname       Print the environment's custom-domain URL.
  render-config  Merge OpenTofu outputs (bindings + the mailtrap_templates var map) into a Wrangler config.
  worker-secrets Filter Doppler JSON on stdin to wrangler.json secrets.required.
  turnstile      Print the Turnstile values as Doppler upload JSON.
"""

from __future__ import annotations

import argparse
import json
import os
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


def render_config(
    env_name: str, config_path: Path, outputs_paths: list[Path], out_path: Path | None
) -> int:
    config = load_config(config_path)

    # Multiple OpenTofu roots each emit their own outputs file. Merge them into
    # one dict; later files override earlier ones, so the caller controls
    # precedence by argument order.
    outputs: dict = {}
    for outputs_path in outputs_paths:
        try:
            loaded = json.loads(outputs_path.read_text())
        except OSError as error:
            print(f"Could not read {outputs_path}: {error}", file=sys.stderr)
            return 1
        except json.JSONDecodeError as error:
            print(f"Invalid JSON in {outputs_path}: {error}", file=sys.stderr)
            return 1
        if not isinstance(loaded, dict):
            print(f"OpenTofu outputs in {outputs_path} must be a JSON object.", file=sys.stderr)
            return 1
        outputs.update(loaded)

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

    mailtrap_templates = output_value(outputs, "mailtrap_templates")
    if not isinstance(mailtrap_templates, dict):
        print(
            "OpenTofu output mailtrap_templates is missing or is not an object.",
            file=sys.stderr,
        )
        return 1

    declared_vars = environment.setdefault("vars", {})
    for template_name, template_id in mailtrap_templates.items():
        if not isinstance(template_id, str) or not template_id.strip():
            print(
                f"OpenTofu output mailtrap_templates has an empty value for {template_name}.",
                file=sys.stderr,
            )
            return 1
        if template_name not in declared_vars:
            print(
                f"OpenTofu output {template_name} is not declared in {config_path}.",
                file=sys.stderr,
            )
            return 1
        declared_vars[template_name] = template_id

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

    for database in env.get("d1_databases", []):
        database_id = database.get("database_id", "")
        if not database_id or database_id.startswith("00000000-"):
            problems.append(f"{database.get('binding', 'D1')} still has a placeholder database_id")

    for namespace in env.get("kv_namespaces", []):
        namespace_id = namespace.get("id", "")
        if not namespace_id or namespace_id.startswith("00000000-"):
            problems.append(f"{namespace.get('binding', 'KV')} still has a placeholder KV id")

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


def turnstile() -> int:
    site = os.environ.get("TURNSTILE_SITE_KEY", "")
    secret = os.environ.get("TURNSTILE_SECRET", "")

    if not site or not secret:
        print("Both TURNSTILE_SITE_KEY and TURNSTILE_SECRET are required.", file=sys.stderr)
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
    render_parser.add_argument(
        "--outputs",
        type=Path,
        action="append",
        required=True,
        help=(
            "OpenTofu output JSON file with d1_databases, kv_namespaces and "
            "mailtrap_templates; repeat for multiple roots (later files override earlier)."
        ),
    )
    render_parser.add_argument("--out", type=Path)

    subparsers.add_parser("turnstile")

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
        return turnstile()

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
