import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

function createdAt() {
	return integer("created_at", { mode: "timestamp_ms" })
		.notNull()
		.$defaultFn(() => new Date());
}

export const scopes = sqliteTable(
	"scopes",
	{
		id: text("id").primaryKey(),
		year: integer("year").notNull(),
		site: text("site").notNull(),
		name: text("name").notNull(),
		availableLanguages: text("available_languages", { mode: "json" })
			.$type<string[]>()
			.notNull()
			.default(sql`('["ja", "en"]')`),
		defaultLanguage: text("default_language").notNull().default("ja"),
		createdAt: createdAt(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	(table) => [uniqueIndex("scopes_year_site_unique").on(table.year, table.site)],
);

export const news = sqliteTable(
	"news",
	{
		id: text("id").primaryKey(),
		scopeId: text("scope_id")
			.notNull()
			.references(() => scopes.id, { onDelete: "cascade" }),
		slug: text("slug").notNull(),
		createdAt: createdAt(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.notNull()
			.$defaultFn(() => new Date()),
		deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
		createdBy: text("created_by").notNull(),
		updatedBy: text("updated_by").notNull(),
	},
	(table) => [
		uniqueIndex("news_scope_slug_unique")
			.on(table.scopeId, table.slug)
			.where(sql`${table.deletedAt} is null`),
		index("news_scope_updated_at_index").on(table.scopeId, table.updatedAt),
	],
);

export const newsTranslations = sqliteTable(
	"news_translations",
	{
		id: text("id").primaryKey(),
		newsId: text("news_id")
			.notNull()
			.references(() => news.id, { onDelete: "cascade" }),
		lang: text("lang").notNull(),
		title: text("title").notNull(),
		summary: text("summary"),
		content: text("content").notNull(),
		contentType: text("content_type", { enum: ["markdown", "link"] })
			.notNull()
			.default("markdown"),
		status: text("status", { enum: ["draft", "published"] })
			.notNull()
			.default("draft"),
		publishedAt: integer("published_at", { mode: "timestamp_ms" }),
		createdAt: createdAt(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.notNull()
			.$defaultFn(() => new Date()),
		deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
		createdBy: text("created_by").notNull(),
		updatedBy: text("updated_by").notNull(),
	},
	(table) => [
		check(
			"news_translations_content_type_check",
			sql`${table.contentType} in ('markdown', 'link')`,
		),
		check("news_translations_status_check", sql`${table.status} in ('draft', 'published')`),
		uniqueIndex("news_translations_news_lang_unique")
			.on(table.newsId, table.lang)
			.where(sql`${table.deletedAt} is null`),
		index("news_translations_news_status_index").on(table.newsId, table.status),
		index("news_translations_news_lang_index").on(table.newsId, table.lang),
		index("news_translations_news_published_at_index").on(table.newsId, table.publishedAt),
		index("news_translations_news_updated_at_index").on(table.newsId, table.updatedAt),
	],
);

export const tags = sqliteTable(
	"tags",
	{
		id: text("id").primaryKey(),
		scopeId: text("scope_id")
			.notNull()
			.references(() => scopes.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		slug: text("slug").notNull(),
		deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
	},
	(table) => [
		uniqueIndex("tags_scope_name_unique")
			.on(table.scopeId, table.name)
			.where(sql`${table.deletedAt} is null`),
		uniqueIndex("tags_scope_slug_unique")
			.on(table.scopeId, table.slug)
			.where(sql`${table.deletedAt} is null`),
		index("tags_scope_index").on(table.scopeId),
	],
);

export const newsTags = sqliteTable(
	"news_tags",
	{
		newsId: text("news_id")
			.notNull()
			.references(() => news.id, { onDelete: "cascade" }),
		tagId: text("tag_id")
			.notNull()
			.references(() => tags.id, { onDelete: "cascade" }),
	},
	(table) => [
		primaryKey({ columns: [table.newsId, table.tagId] }),
		index("news_tags_tag_id_index").on(table.tagId),
	],
);

export const assets = sqliteTable(
	"assets",
	{
		id: text("id").primaryKey(),
		scopeId: text("scope_id")
			.notNull()
			.references(() => scopes.id, { onDelete: "cascade" }),
		objectKey: text("object_key").notNull(),
		filename: text("filename").notNull(),
		mimeType: text("mime_type").notNull(),
		size: integer("size").notNull(),
		uploaderActor: text("uploader_actor").notNull(),
		createdAt: createdAt(),
		deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
	},
	(table) => [
		uniqueIndex("assets_scope_object_key_unique")
			.on(table.scopeId, table.objectKey)
			.where(sql`${table.deletedAt} is null`),
		index("assets_scope_index").on(table.scopeId),
	],
);

export const auditLogs = sqliteTable(
	"audit_logs",
	{
		id: text("id").primaryKey(),
		scopeId: text("scope_id").references(() => scopes.id, { onDelete: "set null" }),
		actorType: text("actor_type").notNull(),
		actorId: text("actor_id").notNull(),
		actorEmail: text("actor_email"),
		actorLabel: text("actor_label").notNull(),
		action: text("action").notNull(),
		entityType: text("entity_type").notNull(),
		entityId: text("entity_id").notNull(),
		changes: text("changes", { mode: "json" }).$type<Record<string, unknown>>(),
		createdAt: createdAt(),
	},
	(table) => [
		index("audit_logs_scope_created_at_index").on(table.scopeId, table.createdAt),
		index("audit_logs_entity_index").on(table.entityType, table.entityId),
		index("audit_logs_actor_index").on(table.actorType, table.actorId),
	],
);

export const schema = {
	scopes,
	news,
	newsTranslations,
	tags,
	newsTags,
	assets,
	auditLogs,
};
