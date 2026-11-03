CREATE TABLE wiki_feedback_comments (
  id TEXT PRIMARY KEY NOT NULL,
  feedback TEXT NOT NULL REFERENCES wiki_feedback(id) ON DELETE CASCADE,
  author TEXT NOT NULL REFERENCES accounts(id),
  nickname TEXT NOT NULL,
  body TEXT NOT NULL,
  created INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX wiki_feedback_comments_parent_created ON wiki_feedback_comments(feedback,created,id);
--> statement-breakpoint
CREATE TABLE wiki_feedback_likes (
  feedback TEXT NOT NULL REFERENCES wiki_feedback(id) ON DELETE CASCADE,
  account TEXT NOT NULL REFERENCES accounts(id),
  PRIMARY KEY(feedback,account)
);
