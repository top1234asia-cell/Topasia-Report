CREATE TABLE `todo_items` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`group_no` text NOT NULL,
	`matter` text NOT NULL,
	`urgent` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`completed_at` integer,
	`completed_by` text
);
