CREATE TABLE `site_notice` (
  `id` integer PRIMARY KEY NOT NULL,
  `content` text NOT NULL,
  `version` integer NOT NULL,
  `updated_at` integer NOT NULL,
  CONSTRAINT `site_notice_singleton` CHECK (`id`=1),
  CONSTRAINT `site_notice_version` CHECK (`version` BETWEEN 1 AND 9007199254740991)
);
