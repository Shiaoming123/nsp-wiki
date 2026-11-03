CREATE TABLE `affix_comment_likes` (
	`comment` text NOT NULL,
	`account` text NOT NULL,
	PRIMARY KEY(`comment`, `account`),
	FOREIGN KEY (`comment`) REFERENCES `affix_comments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `affix_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`affix` text NOT NULL,
	`author` text NOT NULL,
	`nickname` text NOT NULL,
	`body` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`author`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `affix_comments_affix_created` ON `affix_comments` (`affix`,`created`,`id`);--> statement-breakpoint
CREATE TABLE `affix_likes` (
	`affix` text NOT NULL,
	`visitor` text NOT NULL,
	PRIMARY KEY(`affix`, `visitor`)
);
--> statement-breakpoint
CREATE TABLE `wiki_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`author` text NOT NULL,
	`nickname` text NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`route` text NOT NULL,
	`body` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`author`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `wiki_feedback_created` ON `wiki_feedback` (`created`,`id`);