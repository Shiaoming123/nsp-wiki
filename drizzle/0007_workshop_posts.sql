ALTER TABLE posts ADD COLUMN kind TEXT NOT NULL DEFAULT 'tier' CHECK(kind IN ('tier','workshop'));
--> statement-breakpoint
ALTER TABLE posts ADD COLUMN workshop TEXT;
--> statement-breakpoint
CREATE INDEX posts_kind_created ON posts(kind,created,id);
