#!/usr/bin/env python3
"""Sync non-secret OpenTofu outputs into wrangler.jsonc.

Reads `tofu output -json` from the Cloudflare infrastructure and applies the
values that Wrangler needs at build/deploy time:

- TURNSTILE_SITE_KEY (production and staging)
- CF_ACCESS_AUD (staff and staging)
- CF_ACCESS_TEAM_DOMAIN, when `access_team_domain` is exported
- D1 database IDs, when `app_db_id` / `events_db_id` /
  `staging_app_db_id` / `staging_events_db_id` are exported

The file is edited by replacing only the value spans, so comments, trailing
commas, and formatting are preserved.

Secrets are never written to wrangler.jsonc. Use `wrangler secret put` for
TURNSTILE_SECRET and MAILTRAP_API_TOKEN.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Sequence

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG = ROOT / "wrangler.jsonc"
DEFAULT_TERRAFORM_DIR = ROOT / "infra" / "cloudflare"
NUMBER_RE = re.compile(r"-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?")


class JsoncError(ValueError):
    """Raised when wrangler.jsonc cannot be parsed or patched."""


@dataclass
class Node:
    kind: str
    start: int
    end: int
    value: str | None = None
    entries: dict[str, "Node"] = field(default_factory=dict)
    items: list["Node"] = field(default_factory=list)
    last_key_start: int | None = None
    last_value_end: int | None = None


class JsoncParser:
    """Small JSONC parser that keeps source spans for targeted edits."""

    def __init__(self, text: str) -> None:
        self.text = text
        self.length = len(text)
        self.pos = 0

    def parse(self) -> Node:
        self.skip_trivia()
        node = self.parse_value()
        self.skip_trivia()
        if self.pos != self.length:
            raise JsoncError(f"Unexpected content at offset {self.pos}.")
        return node

    def skip_trivia(self) -> None:
        while self.pos < self.length:
            char = self.text[self.pos]
            if char in " \t\r\n":
                self.pos += 1
            elif self.text.startswith("//", self.pos):
                newline = self.text.find("\n", self.pos + 2)
                self.pos = self.length if newline == -1 else newline + 1
            elif self.text.startswith("/*", self.pos):
                end = self.text.find("*/", self.pos + 2)
                if end == -1:
                    raise JsoncError(f"Unterminated block comment at offset {self.pos}.")
                self.pos = end + 2
            else:
                return

    def parse_value(self) -> Node:
        self.skip_trivia()
        if self.pos >= self.length:
            raise JsoncError("Unexpected end of file.")

        char = self.text[self.pos]
        if char == "{":
            return self.parse_object()
        if char == "[":
            return self.parse_array()
        if char == '"':
            return self.parse_string()
        if self.text.startswith("true", self.pos):
            return self.parse_literal("true")
        if self.text.startswith("false", self.pos):
            return self.parse_literal("false")
        if self.text.startswith("null", self.pos):
            return self.parse_literal("null")

        match = NUMBER_RE.match(self.text, self.pos)
        if match is not None:
            start = self.pos
            self.pos = match.end()
            return Node("number", start, self.pos)

        raise JsoncError(f"Unexpected token at offset {self.pos}.")

    def parse_literal(self, literal: str) -> Node:
        start = self.pos
        self.pos += len(literal)
        return Node("literal", start, self.pos)

    def parse_string(self) -> Node:
        start = self.pos
        if self.text[self.pos] != '"':
            raise JsoncError(f"Expected a string at offset {self.pos}.")
        self.pos += 1
        while self.pos < self.length:
            char = self.text[self.pos]
            if char == "\\":
                self.pos += 2
                continue
            self.pos += 1
            if char == '"':
                raw = self.text[start : self.pos]
                try:
                    value = json.loads(raw)
                except json.JSONDecodeError as error:
                    raise JsoncError(f"Invalid string at offset {start}: {error}") from error
                return Node("string", start, self.pos, value=value)
        raise JsoncError(f"Unterminated string at offset {start}.")

    def parse_object(self) -> Node:
        start = self.pos
        self.pos += 1
        entries: dict[str, Node] = {}
        last_key_start: int | None = None
        last_value_end: int | None = None

        while True:
            self.skip_trivia()
            if self.pos >= self.length:
                raise JsoncError(f"Unterminated object at offset {start}.")
            if self.text[self.pos] == "}":
                self.pos += 1
                return Node(
                    "object",
                    start,
                    self.pos,
                    entries=entries,
                    last_key_start=last_key_start,
                    last_value_end=last_value_end,
                )

            key = self.parse_string()
            self.skip_trivia()
            if self.pos >= self.length or self.text[self.pos] != ":":
                raise JsoncError(f"Expected ':' after object key at offset {self.pos}.")
            self.pos += 1

            value = self.parse_value()
            last_key_start = key.start
            last_value_end = value.end
            if key.value is not None:
                entries[key.value] = value

            self.skip_trivia()
            if self.pos >= self.length:
                raise JsoncError(f"Unterminated object at offset {start}.")
            if self.text[self.pos] == ",":
                self.pos += 1
                continue
            if self.text[self.pos] == "}":
                self.pos += 1
                return Node(
                    "object",
                    start,
                    self.pos,
                    entries=entries,
                    last_key_start=last_key_start,
                    last_value_end=last_value_end,
                )
            raise JsoncError(f"Expected ',' or '}}' at offset {self.pos}.")

    def parse_array(self) -> Node:
        start = self.pos
        self.pos += 1
        items: list[Node] = []

        while True:
            self.skip_trivia()
            if self.pos >= self.length:
                raise JsoncError(f"Unterminated array at offset {start}.")
            if self.text[self.pos] == "]":
                self.pos += 1
                return Node("array", start, self.pos, items=items)

            items.append(self.parse_value())
            self.skip_trivia()
            if self.pos >= self.length:
                raise JsoncError(f"Unterminated array at offset {start}.")
            if self.text[self.pos] == ",":
                self.pos += 1
                continue
            if self.text[self.pos] == "]":
                self.pos += 1
                return Node("array", start, self.pos, items=items)
            raise JsoncError(f"Expected ',' or ']' at offset {self.pos}.")


@dataclass(frozen=True)
class Edit:
    start: int
    end: int
    replacement: str
    label: str


def lookup(root: Node, path: Sequence[str | int]) -> Node:
    node = root
    for part in path:
        if isinstance(part, int):
            if node.kind != "array" or part < 0 or part >= len(node.items):
                raise JsoncError(f"Array index {part} is missing for {'.'.join(map(str, path))}.")
            node = node.items[part]
        else:
            if node.kind != "object" or part not in node.entries:
                raise JsoncError(f"Key '{part}' is missing for {'.'.join(map(str, path))}.")
            node = node.entries[part]
    return node


def find_binding(root: Node, path: Sequence[str | int], binding: str) -> int:
    items = lookup(root, path)
    if items.kind != "array":
        raise JsoncError(f"{'.'.join(map(str, path))} must be an array.")

    for index, item in enumerate(items.items):
        binding_node = item.entries.get("binding")
        if binding_node is not None and binding_node.kind == "string" and binding_node.value == binding:
            return index

    raise JsoncError(f"No binding named '{binding}' in {'.'.join(map(str, path))}.")


def skip_trivia_at(text: str, position: int) -> int:
    length = len(text)
    while position < length:
        char = text[position]
        if char in " \t\r\n":
            position += 1
        elif text.startswith("//", position):
            newline = text.find("\n", position + 2)
            position = length if newline == -1 else newline + 1
        elif text.startswith("/*", position):
            end = text.find("*/", position + 2)
            if end == -1:
                return position
            position = end + 2
        else:
            return position
    return position


def line_indent(text: str, position: int) -> str:
    start = text.rfind("\n", 0, position) + 1
    line = text[start:position]
    return line[: len(line) - len(line.lstrip(" \t"))]


def insert_object_property(
    text: str,
    parent: Node,
    key: str,
    value: str,
    edits: list[Edit],
    label: str,
) -> None:
    if parent.kind != "object":
        raise JsoncError(f"{label} parent is not an object.")

    encoded = json.dumps(value, ensure_ascii=False)

    if parent.last_key_start is None or parent.last_value_end is None:
        closing = parent.end - 1
        indent = line_indent(text, parent.start) + "  "
        edits.append(Edit(closing, closing, f'\n{indent}"{key}": {encoded},\n', label))
        return

    indent = line_indent(text, parent.last_key_start)
    after_value = skip_trivia_at(text, parent.last_value_end)

    if after_value < len(text) and text[after_value] == ",":
        insert_at = after_value + 1
        replacement = f'\n{indent}"{key}": {encoded},'
    else:
        insert_at = parent.last_value_end
        replacement = f',\n{indent}"{key}": {encoded}'

    edits.append(Edit(insert_at, insert_at, replacement, label))


def set_string(
    text: str,
    root: Node,
    path: Sequence[str | int],
    value: str,
    edits: list[Edit],
    label: str,
) -> None:
    try:
        node = lookup(root, path)
    except JsoncError:
        if len(path) < 2 or not isinstance(path[-1], str):
            raise
        parent = lookup(root, path[:-1])
        insert_object_property(text, parent, path[-1], value, edits, label)
        return

    if node.kind != "string":
        raise JsoncError(f"{label} is not a string in wrangler.jsonc.")
    if node.value == value:
        return
    edits.append(Edit(node.start, node.end, json.dumps(value, ensure_ascii=False), label))


def output_value(outputs: dict[str, Any], name: str) -> str | None:
    entry = outputs.get(name)
    if not isinstance(entry, dict):
        return None
    value = entry.get("value")
    return value if isinstance(value, str) else None


def build_edits(text: str, outputs: dict[str, Any]) -> tuple[str, list[str]]:
    root = JsoncParser(text).parse()
    edits: list[Edit] = []

    site_key = output_value(outputs, "turnstile_site_key")
    if site_key:
        set_string(text, root, ("vars", "TURNSTILE_SITE_KEY"), site_key, edits, "vars.TURNSTILE_SITE_KEY")
        set_string(
            text,
            root,
            ("env", "staging", "vars", "TURNSTILE_SITE_KEY"),
            site_key,
            edits,
            "env.staging.vars.TURNSTILE_SITE_KEY",
        )

    team_domain = output_value(outputs, "access_team_domain")
    if team_domain is not None:
        set_string(
            text,
            root,
            ("vars", "CF_ACCESS_TEAM_DOMAIN"),
            team_domain,
            edits,
            "vars.CF_ACCESS_TEAM_DOMAIN",
        )
        set_string(
            text,
            root,
            ("env", "staging", "vars", "CF_ACCESS_TEAM_DOMAIN"),
            team_domain,
            edits,
            "env.staging.vars.CF_ACCESS_TEAM_DOMAIN",
        )

    staff_aud = output_value(outputs, "staff_access_aud")
    if staff_aud is not None:
        set_string(text, root, ("vars", "CF_ACCESS_AUD"), staff_aud, edits, "vars.CF_ACCESS_AUD")

    staging_aud = output_value(outputs, "staging_access_aud")
    if staging_aud is not None:
        set_string(
            text,
            root,
            ("env", "staging", "vars", "CF_ACCESS_AUD"),
            staging_aud,
            edits,
            "env.staging.vars.CF_ACCESS_AUD",
        )

    database_outputs = (
        (None, "app_db_name", "app_db_id", "APP_DB"),
        (None, "events_db_name", "events_db_id", "EVENT_ENGINE_DB"),
        ("staging", "staging_app_db_name", "staging_app_db_id", "APP_DB"),
        ("staging", "staging_events_db_name", "staging_events_db_id", "EVENT_ENGINE_DB"),
    )
    for environment, name_output, id_output, binding in database_outputs:
        database_name = output_value(outputs, name_output)
        database_id = output_value(outputs, id_output)
        if not database_name and not database_id:
            continue

        base_path: tuple[str | int, ...] = (
            ("env", "staging", "d1_databases") if environment == "staging" else ("d1_databases",)
        )
        index = find_binding(root, base_path, binding)

        if database_name:
            set_string(
                text,
                root,
                (*base_path, index, "database_name"),
                database_name,
                edits,
                f"{'.'.join(map(str, base_path))}[{index}].database_name ({binding})",
            )

        if database_id:
            set_string(
                text,
                root,
                (*base_path, index, "database_id"),
                database_id,
                edits,
                f"{'.'.join(map(str, base_path))}[{index}].database_id ({binding})",
            )

    unique: dict[tuple[int, int], Edit] = {}
    for edit in edits:
        previous = unique.get((edit.start, edit.end))
        if previous is not None and previous.replacement != edit.replacement:
            raise JsoncError(f"Conflicting edits for {edit.label}.")
        unique[(edit.start, edit.end)] = edit

    ordered = sorted(unique.values(), key=lambda edit: edit.start, reverse=True)
    result = text
    right_edge = len(text)
    for edit in ordered:
        if edit.end > right_edge:
            raise JsoncError(f"Overlapping edits at {edit.label}.")
        result = result[: edit.start] + edit.replacement + result[edit.end :]
        right_edge = edit.start

    return result, sorted(edit.label for edit in ordered)


def read_outputs(tofu_bin: str, terraform_dir: Path) -> dict[str, Any]:
    command = [tofu_bin, f"-chdir={terraform_dir}", "output", "-json"]
    process = subprocess.run(command, capture_output=True, text=True, encoding="utf-8")
    if process.returncode != 0:
        detail = process.stderr.strip() or process.stdout.strip()
        raise RuntimeError(f"{' '.join(command)} failed:\n{detail}")

    parsed = json.loads(process.stdout)
    if not isinstance(parsed, dict):
        raise RuntimeError("OpenTofu output was not a JSON object.")
    return parsed


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Sync non-secret OpenTofu outputs into wrangler.jsonc.",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Report drift and exit non-zero instead of writing the file.",
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=DEFAULT_CONFIG,
        help=f"Path to wrangler.jsonc (default: {DEFAULT_CONFIG.relative_to(ROOT)}).",
    )
    parser.add_argument(
        "--terraform-dir",
        type=Path,
        default=DEFAULT_TERRAFORM_DIR,
        help=f"OpenTofu working directory (default: {DEFAULT_TERRAFORM_DIR.relative_to(ROOT)}).",
    )
    parser.add_argument(
        "--tofu",
        default=os.environ.get("TOFU_BIN", "tofu"),
        help="OpenTofu binary (default: $TOFU_BIN or 'tofu').",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    config_path: Path = args.config
    terraform_dir: Path = args.terraform_dir

    if not config_path.is_file():
        print(f"Config file not found: {config_path}", file=sys.stderr)
        return 1
    if not terraform_dir.is_dir():
        print(f"OpenTofu directory not found: {terraform_dir}", file=sys.stderr)
        return 1

    try:
        outputs = read_outputs(args.tofu, terraform_dir)
        original = config_path.read_text(encoding="utf-8")
        updated, labels = build_edits(original, outputs)
    except (JsoncError, RuntimeError, json.JSONDecodeError, OSError) as error:
        print(error, file=sys.stderr)
        return 1

    if updated == original:
        print(f"{config_path} is up to date.")
        return 0

    if args.check:
        print(f"{config_path} is out of date:", file=sys.stderr)
        for label in labels:
            print(f"  - {label}", file=sys.stderr)
        print("Run `bun run cf:sync` to update it.", file=sys.stderr)
        return 1

    config_path.write_text(updated, encoding="utf-8")
    print(f"Updated {config_path}:")
    for label in labels:
        print(f"  - {label}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
