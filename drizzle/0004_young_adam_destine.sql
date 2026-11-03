CREATE TABLE `item_comment_likes` (
	`comment` text NOT NULL,
	`account` text NOT NULL,
	PRIMARY KEY(`comment`, `account`),
	FOREIGN KEY (`comment`) REFERENCES `item_comments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `item_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`item` text NOT NULL,
	`author` text NOT NULL,
	`nickname` text NOT NULL,
	`body` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`author`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `item_comments_item_created` ON `item_comments` (`item`,`created`,`id`);--> statement-breakpoint
CREATE TABLE `item_likes` (
	`item` text NOT NULL,
	`visitor` text NOT NULL,
	PRIMARY KEY(`item`, `visitor`)
);
