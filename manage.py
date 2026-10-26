#!/usr/bin/env python3
"""Database management for the NguoiVietSJ event engine.

Run `python manage.py --help` for the command list.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, Sequence

ROOT = Path(__file__).resolve().parent
TARGETS = ("local", "staging", "production")
DATABASES = ("app", "events", "all")
ROLES = ("staff", "admin")
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@dataclass(frozen=True)
class TargetConfig:
    local: bool
    env: str | None
    app_db: str
    events_db: str

    def wrangler_args(self) -> list[str]:
        args = ["--local"] if self.local else ["--remote"]
        if self.env is not None:
            args.extend(["--env", self.env])
        return args


TARGET_CONFIGS: Mapping[str, TargetConfig] = {
    "local": TargetConfig(
        local=True,
        env=None,
        app_db="nguoivietsj-db",
        events_db="nguoivietsj-event-engine-db",
    ),
    "staging": TargetConfig(
        local=False,
        env="staging",
        app_db="nguoivietsj-staging-db",
        events_db="nguoivietsj-staging-event-engine-db",
    ),
    "production": TargetConfig(
        local=False,
        env=None,
        app_db="nguoivietsj-db",
        events_db="nguoivietsj-event-engine-db",
    ),
}


@dataclass(frozen=True)
class Backfill:
    name: str
    database: str
    description: str
    sql: str


BACKFILLS: Mapping[str, Backfill] = {
    "registration-stats": Backfill(
        name="registration-stats",
        database="events",
        description="Rebuild registration and ticket-type aggregate counters.",
        sql="""
DELETE FROM ticket_type_stats;
INSERT INTO ticket_type_stats (event_id, ticket_type_key, tickets_sold)
SELECT t.event_id, t.key, COALESCE(SUM(r.quantity), 0)
FROM event_ticket_types AS t
LEFT JOIN registration_tickets AS r
  ON r.event_id = t.event_id
 AND r.ticket_type_key = t.key
GROUP BY t.event_id, t.key;

DELETE FROM registration_stats;
INSERT INTO registration_stats (event_id, registration_count, tickets_total)
SELECT e.id,
       (SELECT COUNT(*) FROM registrations WHERE event_id = e.id),
       (SELECT COALESCE(SUM(quantity), 0)
        FROM registration_tickets
        WHERE event_id = e.id)
FROM events AS e;
""".strip(),
    ),
    "event-default-locale": Backfill(
        name="event-default-locale",
        database="events",
        description="Move events with a missing default-locale title back to English.",
        sql="""
UPDATE events
SET default_locale = CASE
  WHEN json_extract(title_json, '$.en') IS NOT NULL THEN 'en'
  ELSE COALESCE(
    (SELECT key
     FROM json_each(events.title_json)
     WHERE key IN ('en', 'fr', 'vi')
     LIMIT 1),
    'en'
  )
END
WHERE json_extract(title_json, '$.' || default_locale) IS NULL;
""".strip(),
    ),
    "payment-updated-at": Backfill(
        name="payment-updated-at",
        database="events",
        description="Set missing payment updated_at values from created_at.",
        sql="UPDATE payments SET updated_at = created_at WHERE updated_at IS NULL;",
    ),
}


def wrangler_command() -> list[str]:
    local = ROOT / "node_modules" / ".bin" / "wrangler"
    if local.is_file():
        return [str(local)]

    installed = shutil.which("wrangler")
    if installed is not None:
        return [installed]

    for runner in ("bunx", "npx"):
        executable = shutil.which(runner)
        if executable is not None:
            return [executable, "wrangler"]

    raise RuntimeError("Wrangler is not installed. Run `bun install` first.")


def run(command: Sequence[str]) -> None:
    printable = " ".join(shlex.quote(part) for part in command)
    print(f"+ {printable}", flush=True)
    subprocess.run(command, check=True, cwd=ROOT)


def run_quiet(command: Sequence[str]) -> None:
    printable = " ".join(shlex.quote(part) for part in command)
    print(f"+ {printable}", flush=True)
    completed = subprocess.run(command, cwd=ROOT, text=True, capture_output=True)

    if completed.returncode != 0:
        if completed.stdout:
            print(completed.stdout, file=sys.stderr)
        if completed.stderr:
            print(completed.stderr, file=sys.stderr)
        raise subprocess.CalledProcessError(completed.returncode, command)


def selected_databases(database: str) -> list[str]:
    return ["app", "events"] if database == "all" else [database]


def database_name(target: TargetConfig, database: str) -> str:
    return target.app_db if database == "app" else target.events_db


def run_wrangler(target: TargetConfig, args: Sequence[str]) -> None:
    run([*wrangler_command(), *args, *target.wrangler_args()])


def migrate(args: argparse.Namespace) -> int:
    target = TARGET_CONFIGS[args.target]
    for database in selected_databases(args.database):
        print(f"Applying {database} migrations to {args.target}.", flush=True)
        run_wrangler(
            target,
            ["d1", "migrations", "apply", database_name(target, database)],
        )
    return 0


def optimize(args: argparse.Namespace) -> int:
    target = TARGET_CONFIGS[args.target]
    for database in selected_databases(args.database):
        print(f"Optimizing {database} on {args.target}.", flush=True)
        run_wrangler(
            target,
            [
                "d1",
                "execute",
                database_name(target, database),
                "--command",
                "PRAGMA optimize",
            ],
        )
    return 0


def uuid7() -> str:
    """Generate a UUIDv7 without requiring Python 3.14+."""
    timestamp_ms = int(time.time() * 1000) & ((1 << 48) - 1)
    random_bytes = os.urandom(10)
    random_a = int.from_bytes(random_bytes[:2], "big") & 0x0FFF
    random_b = int.from_bytes(random_bytes[2:], "big") & ((1 << 62) - 1)
    value = (timestamp_ms << 80) | (0x7 << 76) | (random_a << 64) | (0b10 << 62) | random_b
    return str(uuid.UUID(int=value))


def sql_quote(value: str) -> str:
    # Wrangler executes seed SQL files without bound parameters. Values are
    # controlled seed constants, so escaping single quotes is sufficient.
    return "'" + value.replace("'", "''") + "'"


def create_user(args: argparse.Namespace) -> int:
    email = args.email.strip().lower()
    if not EMAIL_PATTERN.fullmatch(email):
        print("manage.py: enter a valid email address", file=sys.stderr)
        return 2

    target = TARGET_CONFIGS[args.target]
    sql = (
        "INSERT INTO users (id, email, role) "
        f"VALUES ({sql_quote(uuid7())}, {sql_quote(email)}, {sql_quote(args.role)}) "
        "ON CONFLICT(email) DO UPDATE SET role = excluded.role;"
    )

    print(f"Creating {args.role} {email} on {args.target}.", flush=True)
    run_wrangler(
        target,
        ["d1", "execute", target.app_db, "--command", sql],
    )
    print(f"{args.role} {email} created.")
    return 0


def list_backfills(_: argparse.Namespace) -> int:
    for backfill in sorted(BACKFILLS.values(), key=lambda item: item.name):
        print(f"{backfill.name:24} {backfill.database:6} {backfill.description}")
    return 0


def backfill(args: argparse.Namespace) -> int:
    backfill_command = BACKFILLS.get(args.name)
    if backfill_command is None:
        print(f"manage.py: unknown backfill: {args.name}", file=sys.stderr)
        return 2

    print(
        f"Backfill {backfill_command.name} on {args.target} "
        f"({backfill_command.database} database).",
        flush=True,
    )

    if args.dry_run:
        print(backfill_command.sql)
        return 0

    target = TARGET_CONFIGS[args.target]
    run_wrangler(
        target,
        [
            "d1",
            "execute",
            database_name(target, backfill_command.database),
            "--command",
            backfill_command.sql,
        ],
    )
    return 0


SEED_EVENT_SLUGS = ("summer-picnic-2027", "test-event-2027")
SEED_EVENT_ALIASES = ("summer-picnic", "picnic-2027", "test-event", "test-2027")


def seeded_id(prefix: int, number: int) -> str:
    return f"01a19000-{prefix:04x}-7000-8000-{number:012d}"


def json_sql(value: object) -> str:
    return sql_quote(json.dumps(value, ensure_ascii=False, separators=(",", ":")))


def seed_text(en: str, fr: str, vi: str) -> dict[str, str]:
    return {"en": en, "fr": fr, "vi": vi}


def seed_contact_sql(
    contact_id: str,
    registration_id: str,
    event_id: str,
    contact: dict[str, object],
    *,
    primary: bool,
    confirmation: bool,
) -> str:
    kind = contact["kind"]
    email = contact.get("email")
    phone = contact.get("phone")
    mail = contact.get("mail")
    return (
        "INSERT INTO registration_contacts ("
        "id, registration_id, event_id, kind, label, is_primary, "
        "is_confirmation_method, email_address, email_normalized, phone_number, "
        "phone_normalized, address_line1, address_line2, city, province, postal_code, "
        "country, value_json"
        ") VALUES ("
        f"{sql_quote(contact_id)}, {sql_quote(registration_id)}, {sql_quote(event_id)}, "
        f"{sql_quote(str(kind))}, NULL, {1 if primary else 0}, {1 if confirmation else 0}, "
        f"{sql_quote(str(email)) if email is not None else 'NULL'}, "
        f"{sql_quote(str(email).lower()) if email is not None else 'NULL'}, "
        f"{sql_quote(str(phone)) if phone is not None else 'NULL'}, "
        f"{sql_quote(normalize_seed_phone(str(phone))) if phone is not None else 'NULL'}, "
        f"{sql_quote(str(mail['line1'])) if mail is not None else 'NULL'}, NULL, "
        f"{sql_quote(str(mail['city'])) if mail is not None else 'NULL'}, "
        f"{sql_quote(str(mail['province'])) if mail is not None else 'NULL'}, "
        f"{sql_quote(str(mail['postal'])) if mail is not None else 'NULL'}, "
        f"{sql_quote(str(mail['country'])) if mail is not None else 'NULL'}, '{{}}'"
        ");"
    )


def normalize_seed_phone(value: str) -> str:
    digits = re.sub(r"\D", "", value)
    return f"+1{digits}" if len(digits) == 10 else f"+{digits}"


def seed_form_schema(active_keys: tuple[str, ...], custom_fields: list[dict[str, object]], details: bool) -> dict[str, object]:
    registration = "registration"
    details_key = "details"
    sections = [
        {"key": registration, "order": 10, "label": seed_text("Registration", "Inscription", "Đăng ký")},
    ]

    if details:
        sections.append(
            {
                "key": details_key,
                "order": 20,
                "label": seed_text("Additional details", "Détails supplémentaires", "Thông tin bổ sung"),
            }
        )

    fields: list[dict[str, object]] = [
        {"ref": "system.fullName", "section": registration, "order": 10, "width": "full"},
        {"ref": "system.contacts.email", "section": registration, "order": 20, "width": "full"},
        {"ref": "system.contacts.phone", "section": registration, "order": 30, "width": "full"},
        {"ref": "system.contacts.mail", "section": registration, "order": 40, "width": "full"},
        {"ref": "system.confirmation", "section": registration, "order": 50, "width": "full"},
    ]

    for index, key in enumerate(active_keys):
        fields.append(
            {
                "ref": f"system.tickets.{key}",
                "section": registration,
                "order": 60 + index,
                "width": "full",
            }
        )

    for index, field in enumerate(custom_fields):
        fields.append(
            {
                "ref": f"custom.{field['key']}",
                "section": details_key if details else registration,
                "order": 10 + index * 10,
                "width": "full",
            }
        )

    fields.append(
        {
            "ref": "system.consent",
            "section": registration,
            "order": 140,
            "width": "full",
        }
    )

    return {
        "version": 4,
        "contacts": {
            "email": {
                "required": True,
                "width": "full",
                "label": seed_text("Email", "Courriel", "Email"),
            },
            "phone": {
                "required": False,
                "width": "full",
                "label": seed_text("Phone", "Téléphone", "Số điện thoại"),
            },
            "mail": {
                "required": False,
                "width": "full",
                "label": seed_text("Mailing address", "Adresse postale", "Địa chỉ thư"),
            },
            "confirmation": {"mode": "optional", "methods": ["email"]},
        },
        "sections": sections,
        "fields": fields,
        "customFields": custom_fields,
    }


def seed_event_sql() -> tuple[str, list[tuple[str, str]]]:
    summer_id = seeded_id(0, 1)
    test_id = seeded_id(0, 2)
    created_at = "2026-11-01T00:00:00.000Z"

    summer_title = seed_text("Summer Picnic 2027", "Pique-nique d'été 2027", "Dã ngoại mùa hè 2027")
    summer_summary = seed_text(
        "Food, games, and a relaxed afternoon by the water.",
        "Repas, jeux et un après-midi détendu au bord de l'eau.",
        "Đồ ăn, trò chơi và một buổi chiều thư giãn bên bờ nước.",
    )
    summer_notes = {
        "en": [
            {"type": "paragraph", "text": "Bring a lawn chair and a reusable water bottle."},
            {"type": "bullets", "items": ["Rain or shine", "Family friendly", "Free parking nearby"]},
            {"type": "link", "label": "Venue map", "href": "https://example.com/summer-picnic-map"},
        ]
    }
    test_title = seed_text("Test Event 2027", "Événement test 2027", "Sự kiện thử nghiệm 2027")
    test_summary = seed_text(
        "Internal event used for registration and check-in testing.",
        "Événement interne pour tester les inscriptions et le pointage.",
        "Sự kiện nội bộ để kiểm tra đăng ký và điểm danh.",
    )
    test_notes = {
        "en": [
            {"type": "paragraph", "text": "Use this event when testing admin and staff workflows."},
            {"type": "bullets", "items": ["Unpaid registration available", "Child ticket available"]},
        ]
    }

    statements = [
        f"""DELETE FROM registration_phone_claims
WHERE event_id IN (SELECT id FROM events WHERE slug IN ({", ".join(sql_quote(slug) for slug in SEED_EVENT_SLUGS)}));""",
        f"""DELETE FROM event_slug_claims
WHERE event_id IN (SELECT id FROM events WHERE slug IN ({", ".join(sql_quote(slug) for slug in SEED_EVENT_SLUGS)}))
   OR slug IN ({", ".join(sql_quote(alias) for alias in SEED_EVENT_ALIASES)});""",
        f"""DELETE FROM registration_status_otps
WHERE registration_id IN (
  SELECT id FROM registrations
  WHERE event_id IN (SELECT id FROM events WHERE slug IN ({", ".join(sql_quote(slug) for slug in SEED_EVENT_SLUGS)}))
);""",
        f"""DELETE FROM registration_status_sessions
WHERE registration_id IN (
  SELECT id FROM registrations
  WHERE event_id IN (SELECT id FROM events WHERE slug IN ({", ".join(sql_quote(slug) for slug in SEED_EVENT_SLUGS)}))
);""",
        f"""DELETE FROM checkins
WHERE registration_id IN (
  SELECT id FROM registrations
  WHERE event_id IN (SELECT id FROM events WHERE slug IN ({", ".join(sql_quote(slug) for slug in SEED_EVENT_SLUGS)}))
);""",
        f"""DELETE FROM payments
WHERE registration_id IN (
  SELECT id FROM registrations
  WHERE event_id IN (SELECT id FROM events WHERE slug IN ({", ".join(sql_quote(slug) for slug in SEED_EVENT_SLUGS)}))
);""",
        f"""DELETE FROM audit_events
WHERE event_id IN (SELECT id FROM events WHERE slug IN ({", ".join(sql_quote(slug) for slug in SEED_EVENT_SLUGS)}));""",
        f"""DELETE FROM registration_failures
WHERE event_id IN (SELECT id FROM events WHERE slug IN ({", ".join(sql_quote(slug) for slug in SEED_EVENT_SLUGS)}));""",
        f"""DELETE FROM registration_field_values
WHERE registration_id IN (
  SELECT id FROM registrations
  WHERE event_id IN (SELECT id FROM events WHERE slug IN ({", ".join(sql_quote(slug) for slug in SEED_EVENT_SLUGS)}))
);""",
        f"""DELETE FROM registration_tickets
WHERE registration_id IN (
  SELECT id FROM registrations
  WHERE event_id IN (SELECT id FROM events WHERE slug IN ({", ".join(sql_quote(slug) for slug in SEED_EVENT_SLUGS)}))
);""",
        f"""DELETE FROM registration_contacts
WHERE registration_id IN (
  SELECT id FROM registrations
  WHERE event_id IN (SELECT id FROM events WHERE slug IN ({", ".join(sql_quote(slug) for slug in SEED_EVENT_SLUGS)}))
);""",
        f"""DELETE FROM registrations
WHERE event_id IN (SELECT id FROM events WHERE slug IN ({", ".join(sql_quote(slug) for slug in SEED_EVENT_SLUGS)}));""",
        f"""DELETE FROM ticket_type_stats
WHERE event_id IN (SELECT id FROM events WHERE slug IN ({", ".join(sql_quote(slug) for slug in SEED_EVENT_SLUGS)}));""",
        f"""DELETE FROM registration_stats
WHERE event_id IN (SELECT id FROM events WHERE slug IN ({", ".join(sql_quote(slug) for slug in SEED_EVENT_SLUGS)}));""",
        f"""DELETE FROM event_form_versions
WHERE event_id IN (SELECT id FROM events WHERE slug IN ({", ".join(sql_quote(slug) for slug in SEED_EVENT_SLUGS)}));""",
        f"""DELETE FROM event_ticket_types
WHERE event_id IN (SELECT id FROM events WHERE slug IN ({", ".join(sql_quote(slug) for slug in SEED_EVENT_SLUGS)}));""",
        f"""DELETE FROM event_ticket_limits
WHERE event_id IN (SELECT id FROM events WHERE slug IN ({", ".join(sql_quote(slug) for slug in SEED_EVENT_SLUGS)}));""",
        f"""DELETE FROM event_aliases
WHERE event_id IN (SELECT id FROM events WHERE slug IN ({", ".join(sql_quote(slug) for slug in SEED_EVENT_SLUGS)}))
   OR alias IN ({", ".join(sql_quote(alias) for alias in SEED_EVENT_ALIASES)});""",
        f"""DELETE FROM events WHERE slug IN ({", ".join(sql_quote(slug) for slug in SEED_EVENT_SLUGS)});""",
    ]

    statements.append(
        f"""INSERT INTO events (
  id, slug, event_type, edition_year, default_locale, status, enabled,
  registration_open, starts_at, ends_at, timezone, title_json, summary_json,
  location_name, location_address, location_map_url, location_map_embed_url,
  payment_etransfer_enabled, payment_etransfer_email, payment_cash_enabled,
  payment_cash_address, payment_cash_map_url, payment_cash_map_embed_url,
  notes_json, created_at, updated_at
) VALUES (
  {sql_quote(summer_id)}, 'summer-picnic-2027', 'summer-picnic', 2027, 'en', 'active', 1,
  1, '2027-07-17T16:00:00.000Z', '2027-07-17T21:00:00.000Z', 'UTC',
  {json_sql(summer_title)}, {json_sql(summer_summary)},
  'Seaside Park', '1 Market Square, Saint John, NB', 'https://example.com/summer-picnic-map', NULL,
  1, 'treasurer@example.com', 1, '1 Market Square, Saint John, NB',
  'https://example.com/summer-picnic-map', NULL, {json_sql(summer_notes)},
  {sql_quote(created_at)}, {sql_quote(created_at)}
);"""
    )
    statements.append(
        f"""INSERT INTO events (
  id, slug, event_type, edition_year, default_locale, status, enabled,
  registration_open, starts_at, ends_at, timezone, title_json, summary_json,
  location_name, location_address, location_map_url, location_map_embed_url,
  payment_etransfer_enabled, payment_etransfer_email, payment_cash_enabled,
  payment_cash_address, payment_cash_map_url, payment_cash_map_embed_url,
  notes_json, created_at, updated_at
) VALUES (
  {sql_quote(test_id)}, 'test-event-2027', 'test', 2027, 'en', 'upcoming', 1,
  1, '2027-09-18T14:00:00.000Z', '2027-09-18T18:00:00.000Z', 'UTC',
  {json_sql(test_title)}, {json_sql(test_summary)},
  'Community Hall', '10 Main Street, Saint John, NB', NULL, NULL,
  0, NULL, 1, '10 Main Street, Saint John, NB', NULL, NULL,
  {json_sql(test_notes)}, {sql_quote(created_at)}, {sql_quote(created_at)}
);"""
    )
    statements.extend(
        [
            f"INSERT INTO event_slug_claims (slug, event_id) VALUES ('summer-picnic-2027', {sql_quote(summer_id)});",
            f"INSERT INTO event_slug_claims (slug, event_id) VALUES ('test-event-2027', {sql_quote(test_id)});",
            f"INSERT INTO event_ticket_limits (event_id, currency, max_tickets_per_registration, max_total_tickets) VALUES ({sql_quote(summer_id)}, 'CAD', 8, 200);",
            f"INSERT INTO event_ticket_limits (event_id, currency, max_tickets_per_registration, max_total_tickets) VALUES ({sql_quote(test_id)}, 'CAD', 4, 75);",
        ]
    )

    summer_tickets = {
        "general": (1500, seed_text("General admission", "Admission générale", "Vé thường")),
        "child": (800, seed_text("Child", "Enfant", "Trẻ em")),
        "vip": (5000, seed_text("VIP", "VIP", "VIP")),
        "volunteer": (0, seed_text("Volunteer", "Bénévole", "Tình nguyện viên")),
    }
    test_tickets = {
        "general": (2000, seed_text("General admission", "Admission générale", "Vé thường")),
        "child": (1000, seed_text("Child", "Enfant", "Trẻ em")),
    }

    for event_id, tickets in ((summer_id, summer_tickets), (test_id, test_tickets)):
        for index, (key, (price, label)) in enumerate(tickets.items()):
            capacity = {"general": 100, "child": 40, "vip": 20, "volunteer": 15}.get(key, 50)
            statements.append(
                f"""INSERT INTO event_ticket_types (
  event_id, key, label_json, description_json, price_minor, min_per_registration,
  max_per_registration, default_quantity, capacity, active, sort_order
) VALUES (
  {sql_quote(event_id)}, {sql_quote(key)}, {json_sql(label)}, NULL, {price}, 0,
  {6 if key == 'general' else 4}, {1 if key == 'general' else 0}, {capacity}, 1, {10 + index * 10}
);"""
            )

    summer_custom_fields = [
        {
            "key": "volunteer",
            "type": "checkbox",
            "required": False,
            "label": seed_text("I can volunteer", "Je peux être bénévole", "Tôi có thể tình nguyện"),
        },
        {
            "key": "dietaryRestrictions",
            "type": "text",
            "required": False,
            "label": seed_text("Dietary restrictions", "Restrictions alimentaires", "Hạn chế ăn uống"),
            "placeholder": seed_text("Vegetarian, allergies, etc.", "Végétarien, allergies, etc.", "Ăn chay, dị ứng, v.v."),
        },
        {
            "key": "tshirtSize",
            "type": "select",
            "required": False,
            "label": seed_text("T-shirt size", "Taille de t-shirt", "Cỡ áo"),
            "options": [
                {"value": "s", "label": seed_text("Small", "Petit", "Nhỏ")},
                {"value": "m", "label": seed_text("Medium", "Moyen", "Vừa")},
                {"value": "l", "label": seed_text("Large", "Grand", "Lớn")},
            ],
            "visibleWhen": {"field": "ticket.general", "op": "gt", "value": 0},
        },
        {
            "key": "accessibility",
            "type": "textarea",
            "required": False,
            "label": seed_text("Accessibility needs", "Besoins d'accessibilité", "Nhu cầu hỗ trợ"),
            "rows": 3,
            "visibleWhen": {"field": "custom.volunteer", "op": "equals", "value": True},
        },
    ]
    test_custom_fields = [
        {
            "key": "company",
            "type": "text",
            "required": False,
            "label": seed_text("Company or group", "Entreprise ou groupe", "Công ty hoặc nhóm"),
        }
    ]

    statements.append(
        f"""INSERT INTO event_form_versions (
  event_id, version, schema_json, status, created_by, published_at
) VALUES (
  {sql_quote(summer_id)}, 1,
  {json_sql(seed_form_schema(tuple(summer_tickets), summer_custom_fields, True))},
  'published', 'seed-admin', {sql_quote(created_at)}
);"""
    )
    statements.append(
        f"""INSERT INTO event_form_versions (
  event_id, version, schema_json, status, created_by, published_at
) VALUES (
  {sql_quote(test_id)}, 1,
  {json_sql(seed_form_schema(tuple(test_tickets), test_custom_fields, False))},
  'published', 'seed-admin', {sql_quote(created_at)}
);"""
    )
    for alias, event_id in (
        ("summer-picnic", summer_id),
        ("picnic-2027", summer_id),
        ("test-event", test_id),
        ("test-2027", test_id),
    ):
        statements.append(
            f"INSERT INTO event_aliases (alias, event_id) VALUES ({sql_quote(alias)}, {sql_quote(event_id)});"
        )
        statements.append(
            f"INSERT INTO event_slug_claims (slug, event_id) VALUES ({sql_quote(alias)}, {sql_quote(event_id)});"
        )

    registrations = [
        {
            "name": "Ada Lovelace",
            "event_id": summer_id,
            "email": "ada@example.com",
            "phone": "5065550101",
            "mail": {"line1": "1 Analytical Engine Way", "city": "Saint John", "province": "NB", "postal": "E2K 1A1", "country": "CA"},
            "tickets": [("general", 2)],
            "answers": {
                "dietaryRestrictions": "Vegetarian",
                "tshirtSize": "m",
                "volunteer": True,
                "accessibility": "Wheelchair access, ground-floor entrance",
            },
            "payment": ("cash", 3000, "Seed cash payment"),
            "checkin": "2026-10-28T18:10:00.000Z",
            "created": "2026-10-28T18:02:27.259Z",
            "token": "local-ada-lovelace-summer-picnic-2027",
        },
        {
            "name": "Grace Hopper",
            "event_id": summer_id,
            "email": "grace@example.com",
            "phone": "5065550102",
            "mail": None,
            "tickets": [("vip", 1)],
            "answers": {},
            "payment": ("etransfer", 5000, "Seed e-transfer payment"),
            "checkin": None,
            "created": "2026-10-28T18:02:44.623Z",
            "token": "local-grace-hopper-summer-picnic-2027",
        },
        {
            "name": "Alan Turing",
            "event_id": summer_id,
            "email": "alan@example.com",
            "phone": None,
            "mail": None,
            "tickets": [("general", 1)],
            "answers": {},
            "payment": None,
            "checkin": None,
            "created": "2026-10-28T18:03:28.264Z",
            "token": "local-alan-turing-summer-picnic-2027",
        },
        {
            "name": "Katherine Johnson",
            "event_id": summer_id,
            "email": "katherine@example.com",
            "phone": "5065550104",
            "mail": {"line1": "4 Orbit Lane", "city": "Saint John", "province": "NB", "postal": "E2K 1A2", "country": "CA"},
            "tickets": [("general", 1), ("child", 2)],
            "answers": {"dietaryRestrictions": "No nuts", "tshirtSize": "l"},
            "payment": ("cash", 3100, "Seed cash payment"),
            "checkin": "2026-10-28T18:15:00.000Z",
            "created": "2026-10-28T18:03:38.412Z",
            "token": "local-katherine-johnson-summer-picnic-2027",
        },
        {
            "name": "Mary Jackson",
            "event_id": summer_id,
            "email": "mary@example.com",
            "phone": "5065550105",
            "mail": None,
            "tickets": [("volunteer", 1)],
            "answers": {"volunteer": True, "accessibility": "Can help with setup"},
            "payment": None,
            "checkin": "2026-10-28T20:20:00.000Z",
            "created": "2026-10-28T20:08:42.673Z",
            "token": "local-mary-jackson-summer-picnic-2027",
        },
        {
            "name": "Dorothy Vaughan",
            "event_id": test_id,
            "email": "dorothy@example.com",
            "phone": "5065550106",
            "mail": None,
            "tickets": [("general", 1)],
            "answers": {"company": "Acme Research"},
            "payment": None,
            "checkin": None,
            "created": "2026-10-28T20:12:00.000Z",
            "token": "local-dorothy-vaughan-test-event-2027",
        },
        {
            "name": "Lillian Gilbreth",
            "event_id": test_id,
            "email": "lillian@example.com",
            "phone": None,
            "mail": None,
            "tickets": [("child", 1)],
            "answers": {"company": "Gilbreth Consulting"},
            "payment": None,
            "checkin": None,
            "created": "2026-10-28T20:15:00.000Z",
            "token": "local-lillian-gilbreth-test-event-2027",
        },
    ]

    tokens: list[tuple[str, str]] = []
    contact_number = 1
    for index, registration in enumerate(registrations, start=1):
        registration_id = seeded_id(1, index)
        full_name = str(registration["name"])
        event_id = str(registration["event_id"])
        created = str(registration["created"])
        statements.append(
            f"""INSERT INTO registrations (
  id, event_id, form_version, full_name, full_name_normalized, consent_at,
  confirmation_email_sent_at, payment_confirmation_email_sent_at, metadata_json,
  created_at
) VALUES (
  {sql_quote(registration_id)}, {sql_quote(event_id)}, 1, {sql_quote(full_name)},
  {sql_quote(full_name.lower())}, {sql_quote(created)}, NULL, NULL,
  {json_sql({"source": "seed", "locale": "en"})}, {sql_quote(created)}
);"""
        )

        contact_specs: list[dict[str, object]] = [{"kind": "email", "email": registration["email"]}]
        if registration["phone"] is not None:
            contact_specs.append({"kind": "phone", "phone": registration["phone"]})
        if registration["mail"] is not None:
            contact_specs.append({"kind": "mail", "mail": registration["mail"]})

        for spec in contact_specs:
            statements.append(
                seed_contact_sql(
                    seeded_id(2, contact_number),
                    registration_id,
                    event_id,
                    spec,
                    primary=spec["kind"] == "email",
                    confirmation=spec["kind"] == "email",
                )
            )
            if spec["kind"] == "phone":
                statements.append(
                    f"""INSERT INTO registration_phone_claims (
  registration_id, event_id, phone_normalized, full_name_normalized
) VALUES (
  {sql_quote(registration_id)}, {sql_quote(event_id)},
  {sql_quote(normalize_seed_phone(str(spec["phone"])))}, {sql_quote(full_name.lower())}
);"""
                )
            contact_number += 1

        ticket_map = summer_tickets if event_id == summer_id else test_tickets
        for key, quantity in registration["tickets"]:
            price, label = ticket_map[key]
            statements.append(
                f"""INSERT INTO registration_tickets (
  registration_id, event_id, ticket_type_key, quantity, unit_price_minor,
  currency, label_snapshot_json
) VALUES (
  {sql_quote(registration_id)}, {sql_quote(event_id)}, {sql_quote(key)}, {quantity},
  {price}, 'CAD', {json_sql(label)}
);"""
            )

        for field_key, value in registration["answers"].items():
            statements.append(
                f"""INSERT INTO registration_field_values (
  registration_id, event_id, field_key, form_version, value_json
) VALUES (
  {sql_quote(registration_id)}, {sql_quote(event_id)}, {sql_quote(field_key)}, 1,
  {json_sql(value)}
);"""
            )

        payment = registration["payment"]
        if payment is not None:
            method, amount, note = payment
            statements.append(
                f"""INSERT INTO payments (
  id, registration_id, amount_minor, currency, method, confirmed_by, note,
  created_at, updated_at
) VALUES (
  {sql_quote(seeded_id(3, index))}, {sql_quote(registration_id)}, {amount}, 'CAD',
  {sql_quote(method)}, 'seed-admin', {sql_quote(note)}, {sql_quote(created)},
  {sql_quote(created)}
);"""
            )
            statements.append(
                f"""INSERT INTO audit_events (
  id, event_id, actor_user_id, action, target_id, metadata, created_at
) VALUES (
  {sql_quote(seeded_id(5, index))}, {sql_quote(event_id)}, 'seed-admin',
  'payment.confirm', {sql_quote(registration_id)},
  {json_sql({"amountMinor": amount, "currency": "CAD", "method": method})},
  {sql_quote(created)}
);"""
            )

        checkin = registration["checkin"]
        if checkin is not None:
            statements.append(
                f"""INSERT INTO checkins (id, registration_id, checked_in_at) VALUES (
  {sql_quote(seeded_id(4, index))}, {sql_quote(registration_id)}, {sql_quote(str(checkin))}
);"""
            )

        token = str(registration["token"])
        statements.append(
            f"""INSERT INTO registration_status_sessions (
  id, registration_id, token_hash, expires_at
) VALUES (
  {sql_quote(seeded_id(6, index))}, {sql_quote(registration_id)},
  {sql_quote(hashlib.sha256(token.encode()).hexdigest())}, '2027-12-31T23:59:59.999Z'
);"""
        )
        tokens.append((full_name, token))

    statements.append(BACKFILLS["registration-stats"].sql)
    return "\n".join(statements), tokens


def seed_users_sql() -> str:
    admin_id = seeded_id(9, 1)
    staff_id = seeded_id(9, 2)
    return (
        "INSERT INTO users (id, email, role) VALUES "
        f"({sql_quote(admin_id)}, 'admin@example.com', 'admin') "
        "ON CONFLICT(email) DO UPDATE SET role = excluded.role;\n"
        "INSERT INTO users (id, email, role) VALUES "
        f"({sql_quote(staff_id)}, 'staff@example.com', 'staff') "
        "ON CONFLICT(email) DO UPDATE SET role = excluded.role;"
    )


def run_wrangler_file(target: TargetConfig, database: str, name: str, sql: str) -> None:
    wrangler_dir = ROOT / ".wrangler"
    wrangler_dir.mkdir(exist_ok=True)
    path = wrangler_dir / name
    path.write_text(sql)
    try:
        run_quiet(
            [
                *wrangler_command(),
                "d1",
                "execute",
                database_name(target, database),
                "--file",
                str(path),
                *target.wrangler_args(),
            ]
        )
    finally:
        path.unlink(missing_ok=True)


def seed(args: argparse.Namespace) -> int:
    if args.target != "local":
        print("manage.py: seed data is local-only", file=sys.stderr)
        return 2

    event_sql, tokens = seed_event_sql()
    print("Seeding local APP_DB users.", flush=True)
    run_wrangler_file(TARGET_CONFIGS["local"], "app", "seed-users.sql", seed_users_sql())
    print("Seeding local EVENT_ENGINE_DB event data.", flush=True)
    run_wrangler_file(TARGET_CONFIGS["local"], "events", "seed-events.sql", event_sql)
    print("Seed complete. Test status links:", flush=True)
    for name, token in tokens:
        print(f"  {name:22} http://localhost:4321/en/events/status/{token}")
    print("Local users: admin@example.com (admin), staff@example.com (staff)")
    return 0


def add_target(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--target",
        choices=TARGETS,
        default="local",
        help="Wrangler target. Defaults to local.",
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Manage the NguoiVietSJ application and event-engine databases.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    migrate_parser = subparsers.add_parser(
        "migrate",
        help="Apply Wrangler D1 migrations.",
    )
    add_target(migrate_parser)
    migrate_parser.add_argument(
        "--database",
        choices=DATABASES,
        default="all",
        help="Database to migrate. Defaults to all.",
    )
    migrate_parser.set_defaults(func=migrate)

    optimize_parser = subparsers.add_parser(
        "optimize",
        help="Run PRAGMA optimize.",
    )
    add_target(optimize_parser)
    optimize_parser.add_argument(
        "--database",
        choices=DATABASES,
        default="all",
        help="Database to optimize. Defaults to all.",
    )
    optimize_parser.set_defaults(func=optimize)

    user_parser = subparsers.add_parser(
        "create-user",
        help="Create or update an application user.",
    )
    user_parser.add_argument("email")
    user_parser.add_argument(
        "--role",
        choices=ROLES,
        default="staff",
        help="User role. Defaults to staff.",
    )
    add_target(user_parser)
    user_parser.set_defaults(func=create_user)

    backfill_parser = subparsers.add_parser(
        "backfill",
        help="Run a named idempotent data backfill.",
    )
    backfill_parser.add_argument("name", choices=sorted(BACKFILLS))
    add_target(backfill_parser)
    backfill_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the SQL without executing it.",
    )
    backfill_parser.set_defaults(func=backfill)

    list_parser = subparsers.add_parser(
        "list-backfills",
        help="List available data backfills.",
    )
    list_parser.set_defaults(func=list_backfills)

    seed_parser = subparsers.add_parser(
        "seed",
        help="Recreate local development events, forms, registrations, payments, and check-ins.",
    )
    add_target(seed_parser)
    seed_parser.set_defaults(func=seed)

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        return args.func(args)
    except RuntimeError as error:
        print(f"manage.py: {error}", file=sys.stderr)
        return 1
    except subprocess.CalledProcessError as error:
        return error.returncode


if __name__ == "__main__":
    raise SystemExit(main())
