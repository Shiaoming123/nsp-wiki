CREATE TABLE `moderation_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`admin` text NOT NULL,
	`action` text NOT NULL,
	`target` text NOT NULL,
	`created` integer NOT NULL
);
