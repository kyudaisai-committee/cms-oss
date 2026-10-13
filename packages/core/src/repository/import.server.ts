import "server-only";

import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import type { Database } from "#core/db.server";
import { auditLogs, news, newsTags, newsTranslations, scopes, tags } from "#core/db/schema";

import { executeRawSqlBatch } from "./shared.server";

type ScopeRecord = InferSelectModel<typeof scopes>;
type NewsRecord = InferSelectModel<typeof news>;
type NewsTranslationRecord = InferSelectModel<typeof newsTranslations>;
type TagRecord = InferSelectModel<typeof tags>;

export type DataImportTargetState = {
	scope: ScopeRecord;
	news: Array<{
		parent: NewsRecord;
		translations: NewsTranslationRecord[];
		tags: TagRecord[];
	}>;
	tags: TagRecord[];
};

export type DataImportWriteSet = {
	state: DataImportTargetState;
	availableLanguages: string[];
	tags: TagRecord[];
	reusedTags: Array<Pick<TagRecord, "id" | "name" | "slug">>;
	skippedNews: Array<Pick<NewsRecord, "id" | "slug">>;
	news: Array<{
		parent: NewsRecord;
		translations: NewsTranslationRecord[];
		tagIds: string[];
	}>;
	createdAt: Date;
	audit: {
		id: string;
		actorType: string;
		actorId: string;
		actorEmail: string | null;
		actorLabel: string;
		changes: Record<string, unknown>;
	};
};

function scopeStateCondition(scope: ScopeRecord, availableLanguages: string[]) {
	return sql`
		${scopes.id} = ${scope.id}
		AND ${scopes.year} = ${scope.year}
		AND ${scopes.site} = ${scope.site}
		AND ${scopes.name} = ${scope.name}
		AND ${scopes.defaultLanguage} = ${scope.defaultLanguage}
		AND json(${scopes.availableLanguages}) = json(${JSON.stringify(availableLanguages)})
	`;
}

function guardedNewsInsert(parent: NewsRecord, scope: ScopeRecord, availableLanguages: string[]) {
	return sql`
		INSERT INTO ${news} (
			${sql.identifier("id")}, ${sql.identifier("scope_id")}, ${sql.identifier("slug")},
			${sql.identifier("created_at")}, ${sql.identifier("updated_at")},
			${sql.identifier("deleted_at")}, ${sql.identifier("created_by")}, ${sql.identifier("updated_by")}
		)
		SELECT ${parent.id}, ${parent.scopeId}, ${parent.slug}, ${parent.createdAt.getTime()},
			${parent.updatedAt.getTime()}, NULL, ${parent.createdBy}, ${parent.updatedBy}
		FROM ${scopes}
		WHERE ${scopeStateCondition(scope, availableLanguages)}
		`;
}

function guardedTagInsert(tag: TagRecord, scope: ScopeRecord, availableLanguages: string[]) {
	return sql`
		INSERT INTO ${tags} (
			${sql.identifier("id")}, ${sql.identifier("scope_id")}, ${sql.identifier("name")},
			${sql.identifier("slug")}, ${sql.identifier("deleted_at")}
		)
		SELECT ${tag.id}, ${tag.scopeId}, ${tag.name}, ${tag.slug}, NULL
		FROM ${scopes}
		WHERE ${scopeStateCondition(scope, availableLanguages)}
		`;
}

function guardedTranslationInsert(
	translation: NewsTranslationRecord,
	scope: ScopeRecord,
	availableLanguages: string[],
) {
	return sql`
		INSERT INTO ${newsTranslations} (
			${sql.identifier("id")}, ${sql.identifier("news_id")}, ${sql.identifier("lang")},
			${sql.identifier("title")}, ${sql.identifier("summary")}, ${sql.identifier("content")},
			${sql.identifier("content_type")}, ${sql.identifier("status")}, ${sql.identifier("published_at")},
			${sql.identifier("created_at")}, ${sql.identifier("updated_at")}, ${sql.identifier("deleted_at")},
			${sql.identifier("created_by")}, ${sql.identifier("updated_by")}
		)
		SELECT ${translation.id}, ${translation.newsId}, ${translation.lang}, ${translation.title},
			${translation.summary}, ${translation.content}, ${translation.contentType},
			${translation.status}, ${translation.publishedAt?.getTime() ?? null},
			${translation.createdAt.getTime()}, ${translation.updatedAt.getTime()}, NULL,
			${translation.createdBy}, ${translation.updatedBy}
		FROM ${scopes}
		WHERE ${scopeStateCondition(scope, availableLanguages)}
		`;
}

function guardedNewsTagInsert(
	newsId: string,
	tagId: string,
	scope: ScopeRecord,
	availableLanguages: string[],
) {
	return sql`
		INSERT INTO ${newsTags} (${sql.identifier("news_id")}, ${sql.identifier("tag_id")})
		SELECT ${newsId}, ${tagId}
	FROM ${scopes}
	WHERE ${scopeStateCondition(scope, availableLanguages)}
		AND EXISTS (
			SELECT 1 FROM ${tags}
			WHERE ${tags.id} = ${tagId} AND ${tags.scopeId} = ${scope.id} AND ${tags.deletedAt} IS NULL
		)
		`;
}

function guardExistingTag(tag: Pick<TagRecord, "id" | "name" | "slug">, scope: ScopeRecord) {
	return sql`
		UPDATE ${scopes} SET ${sql.identifier("id")} = NULL
		WHERE ${scopes.id} = ${scope.id}
		AND NOT EXISTS (
			SELECT 1 FROM ${tags}
			WHERE ${tags.id} = ${tag.id} AND ${tags.scopeId} = ${scope.id}
				AND ${tags.name} = ${tag.name} AND ${tags.slug} = ${tag.slug} AND ${tags.deletedAt} IS NULL
		)
		`;
}

function guardSkippedNews(item: Pick<NewsRecord, "id" | "slug">, scope: ScopeRecord) {
	return sql`
		UPDATE ${scopes} SET ${sql.identifier("id")} = NULL
		WHERE ${scopes.id} = ${scope.id}
		AND NOT EXISTS (
			SELECT 1 FROM ${news}
			WHERE ${news.id} = ${item.id} AND ${news.scopeId} = ${scope.id}
				AND ${news.slug} = ${item.slug} AND ${news.deletedAt} IS NULL
		)
		`;
}

function guardedAuditInsert(writeSet: DataImportWriteSet) {
	return sql`
		INSERT INTO ${auditLogs} (
			${sql.identifier("id")}, ${sql.identifier("scope_id")}, ${sql.identifier("actor_type")},
			${sql.identifier("actor_id")}, ${sql.identifier("actor_email")}, ${sql.identifier("actor_label")},
			${sql.identifier("action")}, ${sql.identifier("entity_type")}, ${sql.identifier("entity_id")},
			${sql.identifier("changes")}, ${sql.identifier("created_at")}
		)
		SELECT ${writeSet.audit.id}, ${writeSet.state.scope.id}, ${writeSet.audit.actorType},
			${writeSet.audit.actorId}, ${writeSet.audit.actorEmail}, ${writeSet.audit.actorLabel},
			'data.import', 'data_import', ${writeSet.audit.id}, ${JSON.stringify(writeSet.audit.changes)},
			${writeSet.createdAt.getTime()}
		FROM ${scopes}
		WHERE ${scopeStateCondition(writeSet.state.scope, writeSet.availableLanguages)}
		`;
}

export class DataImportRepository {
	constructor(private readonly database: Database) {}

	async readTarget(scopeId: string): Promise<DataImportTargetState | null> {
		const [scope] = await this.database
			.select()
			.from(scopes)
			.where(eq(scopes.id, scopeId))
			.limit(1);
		if (!scope) return null;

		const [parents, translationRows, activeTags, tagRows] = await Promise.all([
			this.database
				.select()
				.from(news)
				.where(and(eq(news.scopeId, scopeId), isNull(news.deletedAt)))
				.orderBy(asc(news.slug), asc(news.id)),
			this.database
				.select({ newsId: newsTranslations.newsId, translation: newsTranslations })
				.from(newsTranslations)
				.innerJoin(news, eq(newsTranslations.newsId, news.id))
				.where(
					and(
						eq(news.scopeId, scopeId),
						isNull(news.deletedAt),
						isNull(newsTranslations.deletedAt),
					),
				)
				.orderBy(asc(news.slug), asc(newsTranslations.lang), asc(newsTranslations.id)),
			this.database
				.select()
				.from(tags)
				.where(and(eq(tags.scopeId, scopeId), isNull(tags.deletedAt)))
				.orderBy(asc(tags.slug), asc(tags.id)),
			this.database
				.select({ newsId: newsTags.newsId, tag: tags })
				.from(newsTags)
				.innerJoin(news, eq(newsTags.newsId, news.id))
				.innerJoin(tags, eq(newsTags.tagId, tags.id))
				.where(
					and(
						eq(news.scopeId, scopeId),
						eq(tags.scopeId, scopeId),
						isNull(news.deletedAt),
						isNull(tags.deletedAt),
					),
				)
				.orderBy(asc(news.slug), asc(tags.slug), asc(tags.id)),
		]);

		const translationsByNews = new Map<string, NewsTranslationRecord[]>();
		for (const row of translationRows) {
			const rows = translationsByNews.get(row.newsId);
			if (rows) rows.push(row.translation);
			else translationsByNews.set(row.newsId, [row.translation]);
		}
		const tagsByNews = new Map<string, TagRecord[]>();
		for (const row of tagRows) {
			const rows = tagsByNews.get(row.newsId);
			if (rows) rows.push(row.tag);
			else tagsByNews.set(row.newsId, [row.tag]);
		}

		return {
			scope,
			news: parents.map((parent) => ({
				parent,
				translations: translationsByNews.get(parent.id) ?? [],
				tags: tagsByNews.get(parent.id) ?? [],
			})),
			tags: activeTags,
		};
	}

	async writeImport(writeSet: DataImportWriteSet) {
		const { scope } = writeSet.state;
		const expectedLanguages = scope.availableLanguages;
		const temporaryName = `\u0001data-import:${crypto.randomUUID()}`;
		const languageListChanged =
			JSON.stringify(expectedLanguages) !== JSON.stringify(writeSet.availableLanguages);
		const statements: SQL[] = [
			sql`
				UPDATE ${scopes} SET ${sql.identifier("name")} = ${temporaryName}
				WHERE ${scopes.id} = ${scope.id}
					AND ${scopes.year} = ${scope.year}
					AND ${scopes.site} = ${scope.site}
					AND ${scopes.name} = ${scope.name}
					AND ${scopes.defaultLanguage} = ${scope.defaultLanguage}
					AND json(${scopes.availableLanguages}) = json(${JSON.stringify(expectedLanguages)})
			`,
			sql`
				UPDATE ${scopes} SET ${sql.identifier("id")} = NULL
				WHERE ${scopes.id} = ${scope.id}
				AND ${scopes.name} != ${temporaryName}
			`,
			sql`
				UPDATE ${scopes}
				SET ${sql.identifier("name")} = ${scope.name}
					${languageListChanged ? sql`, ${sql.identifier("available_languages")} = ${JSON.stringify(writeSet.availableLanguages)}, ${sql.identifier("updated_at")} = ${writeSet.createdAt.getTime()}` : sql``}
				WHERE ${scopes.id} = ${scope.id} AND ${scopes.name} = ${temporaryName}
			`,
		];

		for (const tag of writeSet.reusedTags) statements.push(guardExistingTag(tag, scope));
		for (const item of writeSet.skippedNews) statements.push(guardSkippedNews(item, scope));
		for (const tag of writeSet.tags)
			statements.push(guardedTagInsert(tag, scope, writeSet.availableLanguages));
		for (const item of writeSet.news) {
			statements.push(guardedNewsInsert(item.parent, scope, writeSet.availableLanguages));
			for (const translation of item.translations)
				statements.push(guardedTranslationInsert(translation, scope, writeSet.availableLanguages));
			for (const tagId of item.tagIds)
				statements.push(
					guardedNewsTagInsert(item.parent.id, tagId, scope, writeSet.availableLanguages),
				);
		}
		statements.push(guardedAuditInsert(writeSet));

		const results = await executeRawSqlBatch(this.database, statements);
		const scopeUpdate = results[0];
		if (!scopeUpdate?.meta?.changes) return false;
		return true;
	}
}
