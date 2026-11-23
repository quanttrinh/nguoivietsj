CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY,
	`event_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`target_id` text,
	`metadata` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_audit_events_event_id_events_id_fk` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE RESTRICT,
	CONSTRAINT "audit_events_metadata" CHECK("metadata" IS NULL OR json_valid("metadata"))
);
--> statement-breakpoint
CREATE TABLE `event_aliases` (
	`alias` text PRIMARY KEY,
	`event_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_event_aliases_event_id_events_id_fk` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `event_slug_claims` (
	`slug` text PRIMARY KEY,
	`event_id` text NOT NULL,
	CONSTRAINT `fk_event_slug_claims_event_id_events_id_fk` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY,
	`slug` text NOT NULL,
	`event_type` text NOT NULL,
	`edition_year` integer NOT NULL,
	`default_locale` text DEFAULT 'en' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`registration_open` integer DEFAULT 0 NOT NULL,
	`starts_at` text,
	`ends_at` text,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`title_json` text NOT NULL,
	`summary_json` text DEFAULT '{}' NOT NULL,
	`location_name` text DEFAULT '' NOT NULL,
	`location_address` text DEFAULT '' NOT NULL,
	`location_map_url` text,
	`location_map_embed_url` text,
	`payment_etransfer_enabled` integer DEFAULT 0 NOT NULL,
	`payment_etransfer_email` text,
	`payment_cash_enabled` integer DEFAULT 0 NOT NULL,
	`payment_cash_address` text,
	`payment_cash_map_url` text,
	`payment_cash_map_embed_url` text,
	`notes_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "events_edition_year" CHECK("edition_year" BETWEEN 2000 AND 2100),
	CONSTRAINT "events_status" CHECK("status" IN ('draft', 'upcoming', 'active', 'archived')),
	CONSTRAINT "events_enabled" CHECK("enabled" IN (0, 1)),
	CONSTRAINT "events_registration_open" CHECK("registration_open" IN (0, 1)),
	CONSTRAINT "events_title_json" CHECK(json_valid("title_json") AND json_type("title_json") = 'object'),
	CONSTRAINT "events_summary_json" CHECK(json_valid("summary_json") AND json_type("summary_json") = 'object'),
	CONSTRAINT "events_etransfer_enabled" CHECK("payment_etransfer_enabled" IN (0, 1)),
	CONSTRAINT "events_cash_enabled" CHECK("payment_cash_enabled" IN (0, 1)),
	CONSTRAINT "events_dates" CHECK("ends_at" IS NULL OR "starts_at" IS NULL OR "ends_at" >= "starts_at")
);
--> statement-breakpoint
CREATE TABLE `registration_stats` (
	`event_id` text PRIMARY KEY,
	`registration_count` integer DEFAULT 0 NOT NULL,
	`tickets_total` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `fk_registration_stats_event_id_events_id_fk` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE RESTRICT,
	CONSTRAINT "registration_stats_count" CHECK("registration_count" >= 0),
	CONSTRAINT "registration_stats_tickets" CHECK("tickets_total" >= 0)
);
--> statement-breakpoint
CREATE TABLE `event_form_versions` (
	`event_id` text NOT NULL,
	`version` integer NOT NULL,
	`schema_json` text NOT NULL,
	`status` text NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`published_at` text,
	CONSTRAINT `event_form_versions_pk` PRIMARY KEY(`event_id`, `version`),
	CONSTRAINT `fk_event_form_versions_event_id_events_id_fk` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE RESTRICT,
	CONSTRAINT "event_form_versions_schema_json" CHECK(json_valid("schema_json") AND json_type("schema_json") = 'object' AND length("schema_json") <= 65536),
	CONSTRAINT "event_form_versions_version" CHECK("version" > 0),
	CONSTRAINT "event_form_versions_status" CHECK("status" IN ('draft', 'published', 'archived'))
);
--> statement-breakpoint
CREATE TABLE `checkins` (
	`id` text PRIMARY KEY,
	`event_id` text NOT NULL,
	`registration_id` text NOT NULL,
	`checked_in_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_checkins_registration_id_event_id_registrations_id_event_id_fk` FOREIGN KEY (`registration_id`,`event_id`) REFERENCES `registrations`(`id`,`event_id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY,
	`event_id` text NOT NULL,
	`registration_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`method` text NOT NULL,
	`confirmed_by` text,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_payments_registration_id_event_id_registrations_id_event_id_fk` FOREIGN KEY (`registration_id`,`event_id`) REFERENCES `registrations`(`id`,`event_id`) ON DELETE CASCADE,
	CONSTRAINT "payments_amount" CHECK("amount_minor" >= 0),
	CONSTRAINT "payments_method" CHECK("method" IN ('cash', 'etransfer', 'other'))
);
--> statement-breakpoint
CREATE TABLE `registration_field_values` (
	`registration_id` text NOT NULL,
	`event_id` text NOT NULL,
	`field_key` text NOT NULL,
	`form_version` integer NOT NULL,
	`value_json` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `registration_field_values_pk` PRIMARY KEY(`registration_id`, `field_key`),
	CONSTRAINT `fk_registration_field_values_registration_id_event_id_form_version_registrations_id_event_id_form_version_fk` FOREIGN KEY (`registration_id`,`event_id`,`form_version`) REFERENCES `registrations`(`id`,`event_id`,`form_version`) ON DELETE CASCADE,
	CONSTRAINT "registration_field_values_json" CHECK(json_valid("value_json") AND length("value_json") <= 4096)
);
--> statement-breakpoint
CREATE TABLE `registration_status_otps` (
	`id` text PRIMARY KEY,
	`registration_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_registration_status_otps_registration_id_registrations_id_fk` FOREIGN KEY (`registration_id`) REFERENCES `registrations`(`id`) ON DELETE CASCADE,
	CONSTRAINT "registration_status_otps_attempts" CHECK("attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE `registration_status_sessions` (
	`id` text PRIMARY KEY,
	`registration_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_registration_status_sessions_registration_id_registrations_id_fk` FOREIGN KEY (`registration_id`) REFERENCES `registrations`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `registration_tickets` (
	`registration_id` text NOT NULL,
	`event_id` text NOT NULL,
	`ticket_type_key` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`label_snapshot_json` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `registration_tickets_pk` PRIMARY KEY(`registration_id`, `ticket_type_key`),
	CONSTRAINT `fk_registration_tickets_registration_id_event_id_registrations_id_event_id_fk` FOREIGN KEY (`registration_id`,`event_id`) REFERENCES `registrations`(`id`,`event_id`) ON DELETE CASCADE,
	CONSTRAINT `fk_registration_tickets_event_id_events_id_fk` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_registration_tickets_event_id_ticket_type_key_event_ticket_types_event_id_key_fk` FOREIGN KEY (`event_id`,`ticket_type_key`) REFERENCES `event_ticket_types`(`event_id`,`key`) ON DELETE RESTRICT,
	CONSTRAINT "registration_tickets_label_json" CHECK(json_valid("label_snapshot_json") AND json_type("label_snapshot_json") = 'object' AND length("label_snapshot_json") <= 4096),
	CONSTRAINT "registration_tickets_quantity" CHECK("quantity" > 0),
	CONSTRAINT "registration_tickets_price" CHECK("unit_price_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE `registration_contacts` (
	`id` text PRIMARY KEY,
	`registration_id` text NOT NULL,
	`event_id` text NOT NULL,
	`kind` text NOT NULL,
	`label` text,
	`is_primary` integer DEFAULT 0 NOT NULL,
	`is_confirmation_method` integer DEFAULT 0 NOT NULL,
	`manual` integer DEFAULT 0 NOT NULL,
	`email_address` text,
	`email_normalized` text,
	`phone_number` text,
	`phone_normalized` text,
	`address_line1` text,
	`address_line2` text,
	`city` text,
	`province` text,
	`postal_code` text,
	`country` text,
	`value_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_registration_contacts_registration_id_event_id_registrations_id_event_id_fk` FOREIGN KEY (`registration_id`,`event_id`) REFERENCES `registrations`(`id`,`event_id`) ON DELETE CASCADE,
	CONSTRAINT `fk_registration_contacts_event_id_events_id_fk` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE RESTRICT,
	CONSTRAINT "registration_contacts_kind" CHECK("kind" IN ('email', 'phone', 'mail')),
	CONSTRAINT "registration_contacts_primary" CHECK("is_primary" IN (0, 1)),
	CONSTRAINT "registration_contacts_confirmation" CHECK("is_confirmation_method" IN (0, 1)),
	CONSTRAINT "registration_contacts_country" CHECK("country" IS NULL OR length("country") = 2),
	CONSTRAINT "registration_contacts_value_json" CHECK(json_valid("value_json") AND json_type("value_json") = 'object' AND length("value_json") <= 4096),
	CONSTRAINT "registration_contacts_shape" CHECK((
        "kind" = 'email'
        AND "email_address" IS NOT NULL
        AND "email_normalized" IS NOT NULL
        AND "phone_number" IS NULL
        AND "phone_normalized" IS NULL
        AND "address_line1" IS NULL
        AND "address_line2" IS NULL
        AND "city" IS NULL
        AND "province" IS NULL
        AND "postal_code" IS NULL
        AND "country" IS NULL
      ) OR (
        "kind" = 'phone'
        AND "phone_number" IS NOT NULL
        AND "phone_normalized" IS NOT NULL
        AND "email_address" IS NULL
        AND "email_normalized" IS NULL
        AND "address_line1" IS NULL
        AND "address_line2" IS NULL
        AND "city" IS NULL
        AND "province" IS NULL
        AND "postal_code" IS NULL
        AND "country" IS NULL
      ) OR (
        "kind" = 'mail'
        AND "address_line1" IS NOT NULL
        AND "city" IS NOT NULL
        AND "province" IS NOT NULL
        AND "postal_code" IS NOT NULL
        AND "country" IS NOT NULL
        AND "email_address" IS NULL
        AND "email_normalized" IS NULL
        AND "phone_number" IS NULL
        AND "phone_normalized" IS NULL
      ))
);
--> statement-breakpoint
CREATE TABLE `registration_phone_claims` (
	`registration_id` text NOT NULL,
	`event_id` text NOT NULL,
	`phone_normalized` text NOT NULL,
	`full_name_normalized` text NOT NULL,
	CONSTRAINT `registration_phone_claims_pk` PRIMARY KEY(`registration_id`, `phone_normalized`),
	CONSTRAINT `fk_registration_phone_claims_registration_id_registrations_id_fk` FOREIGN KEY (`registration_id`) REFERENCES `registrations`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_registration_phone_claims_event_id_events_id_fk` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `registrations` (
	`id` text PRIMARY KEY,
	`event_id` text NOT NULL,
	`form_version` integer,
	`full_name` text NOT NULL,
	`full_name_normalized` text NOT NULL,
	`manual` integer DEFAULT 0 NOT NULL,
	`consent_at` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_registrations_event_id_events_id_fk` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_registrations_event_id_form_version_event_form_versions_event_id_version_fk` FOREIGN KEY (`event_id`,`form_version`) REFERENCES `event_form_versions`(`event_id`,`version`),
	CONSTRAINT "registrations_metadata_json" CHECK(json_valid("metadata_json") AND json_type("metadata_json") = 'object' AND length("metadata_json") <= 16384)
);
--> statement-breakpoint
CREATE TABLE `event_ticket_limits` (
	`event_id` text PRIMARY KEY,
	`currency` text DEFAULT 'CAD' NOT NULL,
	`max_tickets_per_registration` integer,
	`max_total_tickets` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_event_ticket_limits_event_id_events_id_fk` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE RESTRICT,
	CONSTRAINT "event_ticket_limits_currency" CHECK(length("currency") = 3),
	CONSTRAINT "event_ticket_limits_max_registration" CHECK("max_tickets_per_registration" IS NULL OR "max_tickets_per_registration" >= 0),
	CONSTRAINT "event_ticket_limits_max_total" CHECK("max_total_tickets" IS NULL OR "max_total_tickets" >= 0)
);
--> statement-breakpoint
CREATE TABLE `event_ticket_types` (
	`event_id` text NOT NULL,
	`key` text NOT NULL,
	`label_json` text NOT NULL,
	`description_json` text,
	`price_minor` integer DEFAULT 0 NOT NULL,
	`min_per_registration` integer DEFAULT 0 NOT NULL,
	`max_per_registration` integer,
	`default_quantity` integer DEFAULT 0 NOT NULL,
	`capacity` integer,
	`active` integer DEFAULT 1 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `event_ticket_types_pk` PRIMARY KEY(`event_id`, `key`),
	CONSTRAINT `fk_event_ticket_types_event_id_event_ticket_limits_event_id_fk` FOREIGN KEY (`event_id`) REFERENCES `event_ticket_limits`(`event_id`) ON DELETE RESTRICT,
	CONSTRAINT "event_ticket_types_label_json" CHECK(json_valid("label_json") AND json_type("label_json") = 'object' AND length("label_json") <= 4096),
	CONSTRAINT "event_ticket_types_description_json" CHECK("description_json" IS NULL OR (json_valid("description_json") AND json_type("description_json") = 'object' AND length("description_json") <= 8192)),
	CONSTRAINT "event_ticket_types_key" CHECK(length("key") BETWEEN 1 AND 64 AND "key" GLOB '[a-z]*' AND "key" NOT GLOB '*[^a-z0-9_]*'),
	CONSTRAINT "event_ticket_types_price" CHECK("price_minor" >= 0),
	CONSTRAINT "event_ticket_types_min" CHECK("min_per_registration" >= 0),
	CONSTRAINT "event_ticket_types_max" CHECK("max_per_registration" IS NULL OR "max_per_registration" >= 0),
	CONSTRAINT "event_ticket_types_default" CHECK("default_quantity" >= 0),
	CONSTRAINT "event_ticket_types_capacity" CHECK("capacity" IS NULL OR "capacity" >= 0),
	CONSTRAINT "event_ticket_types_active_check" CHECK("active" IN (0, 1)),
	CONSTRAINT "event_ticket_types_max_min" CHECK("max_per_registration" IS NULL OR "max_per_registration" >= "min_per_registration"),
	CONSTRAINT "event_ticket_types_default_min" CHECK("default_quantity" >= "min_per_registration"),
	CONSTRAINT "event_ticket_types_default_max" CHECK("max_per_registration" IS NULL OR "default_quantity" <= "max_per_registration")
);
--> statement-breakpoint
CREATE TABLE `ticket_type_stats` (
	`event_id` text NOT NULL,
	`ticket_type_key` text NOT NULL,
	`tickets_sold` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `ticket_type_stats_pk` PRIMARY KEY(`event_id`, `ticket_type_key`),
	CONSTRAINT `fk_ticket_type_stats_event_id_ticket_type_key_event_ticket_types_event_id_key_fk` FOREIGN KEY (`event_id`,`ticket_type_key`) REFERENCES `event_ticket_types`(`event_id`,`key`) ON DELETE RESTRICT,
	CONSTRAINT "ticket_type_stats_sold" CHECK("tickets_sold" >= 0)
);
--> statement-breakpoint
CREATE INDEX `audit_events_event_created_at` ON `audit_events` (`event_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_events_event_target` ON `audit_events` (`event_id`,`target_id`);--> statement-breakpoint
CREATE INDEX `event_aliases_event_id` ON `event_aliases` (`event_id`);--> statement-breakpoint
CREATE INDEX `event_slug_claims_event_id` ON `event_slug_claims` (`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `events_slug_unique` ON `events` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `events_type_year_unique` ON `events` (`event_type`,`edition_year`);--> statement-breakpoint
CREATE INDEX `events_created_at` ON `events` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `events_public_list` ON `events` (`enabled`,`status`,`starts_at`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `event_form_versions_published` ON `event_form_versions` (`event_id`) WHERE "event_form_versions"."status" = 'published';--> statement-breakpoint
CREATE INDEX `event_form_versions_event_status` ON `event_form_versions` (`event_id`,`status`,`version`);--> statement-breakpoint
CREATE INDEX `checkins_event_checked_in_at` ON `checkins` (`event_id`,`checked_in_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `checkins_registration_unique` ON `checkins` (`registration_id`);--> statement-breakpoint
CREATE INDEX `payments_event_id` ON `payments` (`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_registration_unique` ON `payments` (`registration_id`);--> statement-breakpoint
CREATE INDEX `registration_field_values_event_field` ON `registration_field_values` (`event_id`,`field_key`);--> statement-breakpoint
CREATE INDEX `registration_field_values_event_value` ON `registration_field_values` (`event_id`,`field_key`,`value_json`);--> statement-breakpoint
CREATE INDEX `registration_status_otps_registration` ON `registration_status_otps` (`registration_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `registration_status_sessions_token` ON `registration_status_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `registration_status_sessions_registration` ON `registration_status_sessions` (`registration_id`);--> statement-breakpoint
CREATE INDEX `registration_tickets_event_type` ON `registration_tickets` (`event_id`,`ticket_type_key`);--> statement-breakpoint
CREATE INDEX `registration_contacts_registration` ON `registration_contacts` (`registration_id`,`kind`);--> statement-breakpoint
CREATE UNIQUE INDEX `registration_contacts_one_primary` ON `registration_contacts` (`registration_id`) WHERE "registration_contacts"."is_primary" = 1;--> statement-breakpoint
CREATE UNIQUE INDEX `registration_contacts_one_confirmation` ON `registration_contacts` (`registration_id`) WHERE "registration_contacts"."is_confirmation_method" = 1;--> statement-breakpoint
CREATE UNIQUE INDEX `registration_contacts_one_mail` ON `registration_contacts` (`registration_id`) WHERE "registration_contacts"."kind" = 'mail';--> statement-breakpoint
CREATE UNIQUE INDEX `registration_contacts_event_email` ON `registration_contacts` (`event_id`,`email_normalized`) WHERE "registration_contacts"."kind" = 'email' AND "registration_contacts"."email_normalized" IS NOT NULL AND "registration_contacts"."manual" = 0;--> statement-breakpoint
CREATE UNIQUE INDEX `registration_contacts_registration_phone` ON `registration_contacts` (`registration_id`,`phone_normalized`) WHERE "registration_contacts"."kind" = 'phone' AND "registration_contacts"."phone_normalized" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `registration_contacts_event_phone` ON `registration_contacts` (`event_id`,`phone_normalized`) WHERE "registration_contacts"."kind" = 'phone' AND "registration_contacts"."phone_normalized" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `registration_contacts_event_postal` ON `registration_contacts` (`event_id`,`postal_code`) WHERE "registration_contacts"."kind" = 'mail';--> statement-breakpoint
CREATE UNIQUE INDEX `registration_phone_claims_identity` ON `registration_phone_claims` (`event_id`,`phone_normalized`,`full_name_normalized`);--> statement-breakpoint
CREATE UNIQUE INDEX `registrations_id_event_unique` ON `registrations` (`id`,`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `registrations_id_event_form_version_unique` ON `registrations` (`id`,`event_id`,`form_version`);--> statement-breakpoint
CREATE INDEX `registrations_event_created_at` ON `registrations` (`event_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `event_ticket_types_active` ON `event_ticket_types` (`event_id`,`active`,`sort_order`);