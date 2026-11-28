DROP INDEX `twoFactor_secret_idx`;--> statement-breakpoint
DROP INDEX `twoFactor_userId_idx`;--> statement-breakpoint
DROP TABLE `two_factor`;--> statement-breakpoint
ALTER TABLE `user` DROP COLUMN `two_factor_enabled`;--> statement-breakpoint
ALTER TABLE `user` DROP COLUMN `two_factor_required`;