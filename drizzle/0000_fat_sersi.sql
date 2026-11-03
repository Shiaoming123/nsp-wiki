CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`post` text NOT NULL,
	`nickname` text NOT NULL,
	`body` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`post`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `comments_post_created` ON `comments` (`post`,`created`,`id`);--> statement-breakpoint
CREATE TABLE `likes` (
	`post` text NOT NULL,
	`visitor` text NOT NULL,
	PRIMARY KEY(`post`, `visitor`),
	FOREIGN KEY (`post`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`nickname` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`image` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `write_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
