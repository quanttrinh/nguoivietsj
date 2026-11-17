CREATE TABLE `email_deliveries` (
	`idempotency_key` text PRIMARY KEY,
	`job_type` text NOT NULL,
	`status` text DEFAULT 'processing' NOT NULL,
	`attempts` integer DEFAULT 1 NOT NULL,
	`last_error` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT "email_deliveries_status" CHECK("status" IN ('processing', 'sent', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `email_deliveries_status_updated_at` ON `email_deliveries` (`status`,`updated_at`);