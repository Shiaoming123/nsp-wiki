CREATE TABLE account_permissions (
 account TEXT NOT NULL REFERENCES accounts(id),
 permission TEXT NOT NULL CHECK(permission IN ('content','users','notice','audit')),
 PRIMARY KEY(account,permission)
);
--> statement-breakpoint
CREATE TABLE account_restrictions (
 account TEXT PRIMARY KEY NOT NULL REFERENCES accounts(id),
 muted_until INTEGER NOT NULL DEFAULT 0 CHECK(muted_until >= 0),
 reason TEXT NOT NULL DEFAULT '',
 version INTEGER NOT NULL CHECK(version > 0),
 updated_by TEXT NOT NULL REFERENCES accounts(id),
 updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE feedback_workflow (
 feedback TEXT PRIMARY KEY NOT NULL REFERENCES wiki_feedback(id) ON DELETE CASCADE,
 status TEXT NOT NULL CHECK(status IN ('open','working','resolved','closed')),
 note TEXT NOT NULL DEFAULT '',
 version INTEGER NOT NULL CHECK(version > 0),
 updated_by TEXT NOT NULL REFERENCES accounts(id),
 updated_at INTEGER NOT NULL
);
--> statement-breakpoint
ALTER TABLE moderation_actions ADD COLUMN detail TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
CREATE INDEX moderation_actions_created ON moderation_actions(created,id);
