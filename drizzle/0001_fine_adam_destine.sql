CREATE TABLE `directory_options` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_directory_options_kind_name` ON `directory_options` (`kind`,`name`);