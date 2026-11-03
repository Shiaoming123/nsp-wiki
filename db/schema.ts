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
  action: text("action").notNull(), target: text("target").notNull(), created: integer("created").notNull(),
});

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
