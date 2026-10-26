DROP TABLE `registration_failures`;--> statement-breakpoint
ALTER TABLE `registrations` DROP COLUMN `confirmation_email_sent_at`;--> statement-breakpoint
ALTER TABLE `registrations` DROP COLUMN `payment_confirmation_email_sent_at`;