CREATE TABLE articles (
  id TEXT PRIMARY KEY NOT NULL,
  author TEXT NOT NULL REFERENCES accounts(id),
  draft_json TEXT NOT NULL,
  published_json TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
  published_revision INTEGER,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','withdrawn')),
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL,
  published_at INTEGER
);
--> statement-breakpoint
CREATE INDEX articles_author_updated ON articles(author,updated,id);
CREATE INDEX articles_status_published ON articles(status,published_at,id);
CREATE TABLE article_revisions (
  article TEXT NOT NULL REFERENCES articles(id), revision INTEGER NOT NULL,
  document TEXT NOT NULL, created INTEGER NOT NULL,
  PRIMARY KEY(article,revision)
);
--> statement-breakpoint
CREATE TABLE article_media (
  id TEXT PRIMARY KEY NOT NULL, owner TEXT NOT NULL REFERENCES accounts(id),
  object_key TEXT NOT NULL UNIQUE, width INTEGER NOT NULL, height INTEGER NOT NULL,
  bytes INTEGER NOT NULL, created INTEGER NOT NULL
);
CREATE INDEX article_media_owner ON article_media(owner,created,id);
CREATE TABLE article_refs (
  article TEXT NOT NULL REFERENCES articles(id), kind TEXT NOT NULL CHECK(kind IN ('item','enemy','quest','media')),
  entity_id TEXT NOT NULL, PRIMARY KEY(article,kind,entity_id)
);
CREATE INDEX article_refs_entity ON article_refs(kind,entity_id,article);
--> statement-breakpoint
CREATE TABLE article_comments (
  id TEXT PRIMARY KEY NOT NULL, article TEXT NOT NULL REFERENCES articles(id),
  author TEXT NOT NULL REFERENCES accounts(id), body TEXT NOT NULL, created INTEGER NOT NULL
);
CREATE INDEX article_comments_article ON article_comments(article,created,id);
CREATE TABLE article_likes (article TEXT NOT NULL REFERENCES articles(id),account TEXT NOT NULL REFERENCES accounts(id),PRIMARY KEY(article,account));
CREATE TABLE article_bookmarks (article TEXT NOT NULL REFERENCES articles(id),account TEXT NOT NULL REFERENCES accounts(id),PRIMARY KEY(article,account));
