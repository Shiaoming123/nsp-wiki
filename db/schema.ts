import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, primaryKey, index, check } from 'drizzle-orm/sqlite-core';
export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(), username: text('username').notNull().unique(), password: text('password').notNull(), created: integer('created').notNull(),
});
export const sessions = sqliteTable('sessions', {
  token: text('token').primaryKey(), account: text('account').notNull().references(() => accounts.id), expires: integer('expires').notNull(),
});
export const posts = sqliteTable('posts', {
  id: text('id').primaryKey(), nickname: text('nickname').notNull(), title: text('title').notNull(),
  body: text('body').notNull(), image: text('image').notNull(), width: integer('width').notNull(),
  height: integer('height').notNull(), created: integer('created').notNull(),
  ranking: text('ranking'), author: text('author').references(() => accounts.id),
  kind: text('kind').notNull().default('tier'), workshop: text('workshop'),
}, t => [index('posts_kind_created').on(t.kind,t.created,t.id),check('posts_kind',sql`${t.kind} IN ('tier','workshop')`)]);
export const likes = sqliteTable('likes', {
  post: text('post').notNull().references(() => posts.id), visitor: text('visitor').notNull(),
}, t => [primaryKey({columns: [t.post, t.visitor]})]);
export const comments = sqliteTable('comments', {
  id: text('id').primaryKey(), post: text('post').notNull().references(() => posts.id),
  nickname: text('nickname').notNull(), body: text('body').notNull(), created: integer('created').notNull(),
  author: text('author').references(() => accounts.id),
}, t => [index('comments_post_created').on(t.post, t.created, t.id)]);
export const writeLimits = sqliteTable('write_limits', {
  key: text('key').primaryKey(), count: integer('count').notNull(), expires: integer('expires').notNull(),
});

export const moderationActions = sqliteTable("moderation_actions", {
  id: text("id").primaryKey(), admin: text("admin").notNull(),
  action: text("action").notNull(), target: text("target").notNull(), created: integer("created").notNull(), detail: text('detail').notNull().default(''),
}, t => [index('moderation_actions_created').on(t.created,t.id)]);

export const itemLikes = sqliteTable('item_likes', {
  item: text('item').notNull(), visitor: text('visitor').notNull(),
}, t => [primaryKey({columns:[t.item,t.visitor]})]);
export const itemComments = sqliteTable('item_comments', {
  id: text('id').primaryKey(), item: text('item').notNull(), author: text('author').notNull().references(() => accounts.id),
  nickname: text('nickname').notNull(), body: text('body').notNull(), created: integer('created').notNull(),
}, t => [index('item_comments_item_created').on(t.item,t.created,t.id)]);
export const itemCommentLikes = sqliteTable('item_comment_likes', {
  comment: text('comment').notNull().references(() => itemComments.id), account: text('account').notNull().references(() => accounts.id),
}, t => [primaryKey({columns:[t.comment,t.account]})]);

export const affixLikes = sqliteTable('affix_likes', {
  affix: text('affix').notNull(), visitor: text('visitor').notNull(),
}, t => [primaryKey({columns:[t.affix,t.visitor]})]);
export const affixComments = sqliteTable('affix_comments', {
  id: text('id').primaryKey(), affix: text('affix').notNull(), author: text('author').notNull().references(() => accounts.id),
  nickname: text('nickname').notNull(), body: text('body').notNull(), created: integer('created').notNull(),
}, t => [index('affix_comments_affix_created').on(t.affix,t.created,t.id)]);
export const affixCommentLikes = sqliteTable('affix_comment_likes', {
  comment: text('comment').notNull().references(() => affixComments.id), account: text('account').notNull().references(() => accounts.id),
}, t => [primaryKey({columns:[t.comment,t.account]})]);
export const wikiFeedback = sqliteTable('wiki_feedback', {
  id: text('id').primaryKey(), author: text('author').notNull().references(() => accounts.id),
  nickname: text('nickname').notNull(), title: text('title').notNull(), category: text('category').notNull(),
  route: text('route').notNull(), body: text('body').notNull(), created: integer('created').notNull(),
}, t => [index('wiki_feedback_created').on(t.created,t.id)]);

export const siteNotice = sqliteTable('site_notice', {
  id: integer('id').primaryKey(), content: text('content').notNull(),
  version: integer('version').notNull(), updatedAt: integer('updated_at').notNull(),
}, t => [check('site_notice_singleton',sql`${t.id}=1`),check('site_notice_version',sql`${t.version} BETWEEN 1 AND 9007199254740991`)]);

export const accountPermissions = sqliteTable('account_permissions', {
  account: text('account').notNull().references(() => accounts.id), permission: text('permission').notNull(),
}, t => [primaryKey({columns:[t.account,t.permission]}),check('account_permissions_value',sql`${t.permission} IN ('content','users','notice','audit')`)]);
export const accountRestrictions = sqliteTable('account_restrictions', {
  account: text('account').primaryKey().references(() => accounts.id), mutedUntil: integer('muted_until').notNull().default(0),
  reason: text('reason').notNull().default(''), version: integer('version').notNull(),
  updatedBy: text('updated_by').notNull().references(() => accounts.id), updatedAt: integer('updated_at').notNull(),
}, t => [check('account_restrictions_time',sql`${t.mutedUntil} >= 0`),check('account_restrictions_version',sql`${t.version} > 0`)]);
export const feedbackWorkflow = sqliteTable('feedback_workflow', {
  feedback: text('feedback').primaryKey().references(() => wikiFeedback.id,{onDelete:'cascade'}),
  status: text('status').notNull(), note: text('note').notNull().default(''), version: integer('version').notNull(),
  updatedBy: text('updated_by').notNull().references(() => accounts.id), updatedAt: integer('updated_at').notNull(),
}, t => [check('feedback_workflow_status',sql`${t.status} IN ('open','working','resolved','closed')`),check('feedback_workflow_version',sql`${t.version} > 0`)]);

export const articles = sqliteTable('articles', {
  id:text('id').primaryKey(),author:text('author').notNull().references(()=>accounts.id),
  draftJson:text('draft_json').notNull(),publishedJson:text('published_json'),revision:integer('revision').notNull().default(1),
  publishedRevision:integer('published_revision'),status:text('status').notNull().default('draft'),
  created:integer('created').notNull(),updated:integer('updated').notNull(),publishedAt:integer('published_at'),
},t=>[index('articles_author_updated').on(t.author,t.updated,t.id),index('articles_status_published').on(t.status,t.publishedAt,t.id),check('articles_status',sql`${t.status} IN ('draft','published','withdrawn')`)]);
export const articleRevisions=sqliteTable('article_revisions',{
  article:text('article').notNull().references(()=>articles.id),revision:integer('revision').notNull(),document:text('document').notNull(),created:integer('created').notNull(),
},t=>[primaryKey({columns:[t.article,t.revision]})]);
export const articleMedia=sqliteTable('article_media',{
  id:text('id').primaryKey(),owner:text('owner').notNull().references(()=>accounts.id),objectKey:text('object_key').notNull().unique(),width:integer('width').notNull(),height:integer('height').notNull(),bytes:integer('bytes').notNull(),created:integer('created').notNull(),
},t=>[index('article_media_owner').on(t.owner,t.created,t.id)]);
export const articleRefs=sqliteTable('article_refs',{
  article:text('article').notNull().references(()=>articles.id),kind:text('kind').notNull(),entityId:text('entity_id').notNull(),
},t=>[primaryKey({columns:[t.article,t.kind,t.entityId]}),index('article_refs_entity').on(t.kind,t.entityId,t.article)]);
export const articleComments=sqliteTable('article_comments',{
  id:text('id').primaryKey(),article:text('article').notNull().references(()=>articles.id),author:text('author').notNull().references(()=>accounts.id),body:text('body').notNull(),created:integer('created').notNull(),
},t=>[index('article_comments_article').on(t.article,t.created,t.id)]);
export const articleLikes=sqliteTable('article_likes',{
  article:text('article').notNull().references(()=>articles.id),account:text('account').notNull().references(()=>accounts.id),
},t=>[primaryKey({columns:[t.article,t.account]})]);
export const articleBookmarks=sqliteTable('article_bookmarks',{
  article:text('article').notNull().references(()=>articles.id),account:text('account').notNull().references(()=>accounts.id),
},t=>[primaryKey({columns:[t.article,t.account]})]);
