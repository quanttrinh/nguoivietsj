ALTER TABLE `checkins` ADD `event_id` text;--> statement-breakpoint
UPDATE `checkins`
SET `event_id` = (
  SELECT `event_id` FROM `registrations` WHERE `registrations`.`id` = `checkins`.`registration_id`
);--> statement-breakpoint
ALTER TABLE `payments` ADD `event_id` text;--> statement-breakpoint
UPDATE `payments`
SET `event_id` = (
  SELECT `event_id` FROM `registrations` WHERE `registrations`.`id` = `payments`.`registration_id`
);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_checkins` (
	`id` text PRIMARY KEY,
	`event_id` text NOT NULL,
	`registration_id` text NOT NULL,
	`checked_in_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_checkins_registration_id_event_id_registrations_id_event_id_fk` FOREIGN KEY (`registration_id`,`event_id`) REFERENCES `registrations`(`id`,`event_id`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `__new_checkins`(`id`, `event_id`, `registration_id`, `checked_in_at`) SELECT `id`, `event_id`, `registration_id`, `checked_in_at` FROM `checkins`;--> statement-breakpoint
DROP TABLE `checkins`;--> statement-breakpoint
ALTER TABLE `__new_checkins` RENAME TO `checkins`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_payments` (
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
	CONSTRAINT "payments_method" CHECK("method" IN ('cash', 'etransfer'))
);
--> statement-breakpoint
INSERT INTO `__new_payments`(`id`, `event_id`, `registration_id`, `amount_minor`, `currency`, `method`, `confirmed_by`, `note`, `created_at`, `updated_at`) SELECT `id`, `event_id`, `registration_id`, `amount_minor`, `currency`, `method`, `confirmed_by`, `note`, `created_at`, `updated_at` FROM `payments`;--> statement-breakpoint
DROP TABLE `payments`;--> statement-breakpoint
ALTER TABLE `__new_payments` RENAME TO `payments`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `checkins_event_checked_in_at` ON `checkins` (`event_id`,`checked_in_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `checkins_registration_unique` ON `checkins` (`registration_id`);--> statement-breakpoint
CREATE INDEX `payments_event_id` ON `payments` (`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_registration_unique` ON `payments` (`registration_id`);
