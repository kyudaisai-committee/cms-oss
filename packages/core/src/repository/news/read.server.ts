import "server-only";

import { and, asc, eq, exists, inArray, isNull, type SQL } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";

import { encodeCursor, type TimeCursor } from "#core/cursor";
import type { Database } from "#core/db.server";
import { news, newsTags, newsTranslations, scopes, tags } from "#core/db/schema";
import { canonicalizeStoredLanguage } from "#core/input";

import type { NewsForExport, NewsPage, NewsWithTags } from "../types";

type ScopeRecord = InferSelectModel<typeof scopes>;
type NewsRecord = InferSelectModel<typeof news>;
type NewsTranslationRecord = InferSelectModel<typeof newsTranslations>;
type TagRecord = InferSelectModel<typeof tags>;

export class NewsReadRepository {
	constructor(private readonly database: Database) {}

	private async tagsForNewsIds(newsIds: string[]) {
		if (newsIds.length === 0) return new Map<string, TagRecord[]>();
		const rows = await this.database
			.select({ newsId: newsTags.newsId, tag: tags })
			.from(newsTags)
			.innerJoin(tags, eq(newsTags.tagId, tags.id))
			.where(and(inArray(newsTags.newsId, newsIds), isNull(tags.deletedAt)));
		const grouped = new Map<string, TagRecord[]>();
		for (const row of rows) grouped.set(row.newsId, [...(grouped.get(row.newsId) ?? []), row.tag]);
		return grouped;
	}

	private async translationsForNewsIds(newsIds: string[]) {
		if (newsIds.length === 0) return new Map<string, NewsTranslationRecord[]>();
		const rows = await this.database
			.select()
			.from(newsTranslations)
			.where(and(inArray(newsTranslations.newsId, newsIds), isNull(newsTranslations.deletedAt)));
		const grouped = new Map<string, NewsTranslationRecord[]>();
		for (const row of rows) grouped.set(row.newsId, [...(grouped.get(row.newsId) ?? []), row]);
		return grouped;
	}

	private async withTags(rows: { parent: NewsRecord; scope: ScopeRecord }[], lang?: string) {
		const grouped = await this.tagsForNewsIds(rows.map((row) => row.parent.id));
		const translationMap = await this.translationsForNewsIds(rows.map((row) => row.parent.id));
		return rows.flatMap((row) => {
			const translations = translationMap.get(row.parent.id) ?? [];
			const translation = lang
				? translations.find((candidate) => canonicalizeStoredLanguage(candidate.lang) === lang)
				: (translations.find(
						(candidate) =>
							canonicalizeStoredLanguage(candidate.lang) ===
							canonicalizeStoredLanguage(row.scope.defaultLanguage),
					) ?? translations[0]);
			if (!translation) return [];
			return [
				{
					parent: row.parent,
					translation,
					tags: grouped.get(row.parent.id) ?? [],
					scope: row.scope,
					translations,
				},
			];
		});
	}

	private async findNews(condition: SQL<unknown> | undefined): Promise<NewsWithTags | null> {
		const rows = await this.database
			.select({ parent: news, scope: scopes })
			.from(news)
			.innerJoin(scopes, eq(news.scopeId, scopes.id))
			.where(and(isNull(news.deletedAt), condition))
			.limit(1);
		const [result] = await this.withTags(rows);
		return result ?? null;
	}

	async findPublishedBySlug(scopeId: string, slug: string, lang = "ja", now = new Date()) {
		const rows = await this.database
			.select({ parent: news, scope: scopes })
			.from(news)
			.innerJoin(scopes, eq(news.scopeId, scopes.id))
			.where(and(isNull(news.deletedAt), eq(news.scopeId, scopeId), eq(news.slug, slug)));
		const [result] = await this.withTags(rows, lang);
		return result &&
			result.translation.status === "published" &&
			result.translation.publishedAt !== null &&
			result.translation.publishedAt <= now
			? result
			: null;
	}

	async findNewsBySlug(scopeId: string, slug: string, lang?: string) {
		const rows = await this.database
			.select({ parent: news, scope: scopes })
			.from(news)
			.innerJoin(scopes, eq(news.scopeId, scopes.id))
			.where(and(isNull(news.deletedAt), eq(news.scopeId, scopeId), eq(news.slug, slug)));
		const [result] = await this.withTags(rows, lang);
		return result ?? null;
	}

	async findNewsParentBySlug(scopeId: string, slug: string) {
		const [row] = await this.database
			.select({ parent: news, scope: scopes })
			.from(news)
			.innerJoin(scopes, eq(news.scopeId, scopes.id))
			.where(and(isNull(news.deletedAt), eq(news.scopeId, scopeId), eq(news.slug, slug)))
			.limit(1);
		return row ?? null;
	}

	async findNewsById(scopeId: string, id: string, lang?: string) {
		const parentRows = await this.database
			.select({ parent: news, scope: scopes })
			.from(news)
			.innerJoin(scopes, eq(news.scopeId, scopes.id))
			.where(and(isNull(news.deletedAt), eq(news.scopeId, scopeId), eq(news.id, id)))
			.limit(1);
		if (parentRows.length > 0) return (await this.withTags(parentRows, lang))[0] ?? null;
		const translationRows = await this.database
			.select({ parent: news, scope: scopes, translation: newsTranslations })
			.from(newsTranslations)
			.innerJoin(news, eq(newsTranslations.newsId, news.id))
			.innerJoin(scopes, eq(news.scopeId, scopes.id))
			.where(
				and(
					eq(newsTranslations.id, id),
					eq(news.scopeId, scopeId),
					isNull(news.deletedAt),
					isNull(newsTranslations.deletedAt),
				),
			)
			.limit(1);
		const matched = translationRows[0];
		if (!matched) return null;
		const [result] = await this.withTags(
			[{ parent: matched.parent, scope: matched.scope }],
			lang ?? canonicalizeStoredLanguage(matched.translation.lang) ?? matched.translation.lang,
		);
		return result ?? null;
	}

	async listForExport(scopeId?: string): Promise<NewsForExport[]> {
		const activeScope = scopeId ? eq(news.scopeId, scopeId) : undefined;
		const parents = await this.database
			.select({ parent: news, scope: scopes })
			.from(news)
			.innerJoin(scopes, eq(news.scopeId, scopes.id))
			.where(and(isNull(news.deletedAt), activeScope))
			.orderBy(asc(scopes.year), asc(scopes.site), asc(news.slug), asc(news.id));
		if (parents.length === 0) return [];

		const translations = await this.database
			.select({ newsId: newsTranslations.newsId, translation: newsTranslations })
			.from(newsTranslations)
			.innerJoin(news, eq(newsTranslations.newsId, news.id))
			.where(and(isNull(news.deletedAt), isNull(newsTranslations.deletedAt), activeScope))
			.orderBy(asc(news.slug), asc(newsTranslations.lang), asc(newsTranslations.id));
		const tagRelations = await this.database
			.select({ newsId: newsTags.newsId, tag: tags })
			.from(newsTags)
			.innerJoin(news, eq(newsTags.newsId, news.id))
			.innerJoin(tags, eq(newsTags.tagId, tags.id))
			.where(
				and(
					isNull(news.deletedAt),
					isNull(tags.deletedAt),
					eq(tags.scopeId, news.scopeId),
					activeScope,
				),
			)
			.orderBy(asc(news.slug), asc(tags.slug), asc(tags.id));

		const translationsByNews = new Map<string, NewsTranslationRecord[]>();
		for (const row of translations) {
			const newsTranslations = translationsByNews.get(row.newsId);
			if (newsTranslations) newsTranslations.push(row.translation);
			else translationsByNews.set(row.newsId, [row.translation]);
		}
		const tagsByNews = new Map<string, TagRecord[]>();
		for (const row of tagRelations) {
			const newsTags = tagsByNews.get(row.newsId);
			if (newsTags) newsTags.push(row.tag);
			else tagsByNews.set(row.newsId, [row.tag]);
		}

		return parents.map(({ parent, scope }) => ({
			parent,
			scope,
			translations: translationsByNews.get(parent.id) ?? [],
			tags: tagsByNews.get(parent.id) ?? [],
		}));
	}

	private async listByTimestamp(
		condition: SQL<unknown> | undefined,
		limit: number,
		cursor: TimeCursor | null,
		usePublishedAt: boolean,
		lang?: string,
		publishedOnly = false,
		search?: string,
		page?: number,
	): Promise<NewsPage> {
		const rows = await this.database
			.select({ parent: news, scope: scopes })
			.from(news)
			.innerJoin(scopes, eq(news.scopeId, scopes.id))
			.where(and(isNull(news.deletedAt), condition));
		const attached = await this.withTags(rows, lang);
		const now = new Date();
		const normalizedSearch = search?.trim().toLocaleLowerCase("ja-JP");
		const filtered = attached.filter(({ parent, translation: item }) => {
			if (
				publishedOnly &&
				!(item.status === "published" && item.publishedAt !== null && item.publishedAt <= now)
			) {
				return false;
			}
			if (!normalizedSearch) return true;
			return [parent.slug, item.title, item.summary ?? ""].some((value) =>
				value.toLocaleLowerCase("ja-JP").includes(normalizedSearch),
			);
		});
		const cursorKey = (item: NewsWithTags) => {
			const date = usePublishedAt ? item.translation.publishedAt : item.parent.updatedAt;
			return { timestamp: date?.getTime() ?? 0, id: item.parent.id };
		};
		filtered.sort((left, right) => {
			const leftKey = cursorKey(left);
			const rightKey = cursorKey(right);
			return rightKey.timestamp - leftKey.timestamp || rightKey.id.localeCompare(leftKey.id);
		});
		const cursorTime = cursor ? new Date(cursor.timestamp).getTime() : null;
		const afterCursor = cursor
			? filtered.filter((item) => {
					const key = cursorKey(item);
					return (
						key.timestamp < (cursorTime ?? 0) ||
						(key.timestamp === cursorTime && key.id < cursor.id)
					);
				})
			: filtered;
		const offset = page === undefined ? 0 : (page - 1) * limit;
		const hasNext = afterCursor.length > offset + limit;
		const items = afterCursor.slice(offset, offset + limit);
		const last = items.at(-1);
		const lastKey = last ? cursorKey(last) : null;
		return {
			items,
			nextCursor:
				hasNext && lastKey
					? encodeCursor({ timestamp: new Date(lastKey.timestamp).toISOString(), id: lastKey.id })
					: null,
			...(page === undefined ? {} : { totalCount: filtered.length }),
		};
	}

	async listPublished(
		scopeId: string,
		limit: number,
		cursor: TimeCursor | null,
		tagSlug?: string,
		lang?: string,
	) {
		const tagCondition = tagSlug
			? exists(
					this.database
						.select()
						.from(newsTags)
						.innerJoin(tags, eq(newsTags.tagId, tags.id))
						.where(
							and(
								eq(newsTags.newsId, news.id),
								eq(tags.scopeId, scopeId),
								eq(tags.slug, tagSlug),
								isNull(tags.deletedAt),
							),
						),
				)
			: undefined;
		return this.listByTimestamp(
			and(eq(news.scopeId, scopeId), tagCondition),
			limit,
			cursor,
			true,
			lang,
			true,
		);
	}

	async listAdmin(
		scopeId: string,
		limit: number,
		cursor: TimeCursor | null,
		tagSlug?: string,
		lang?: string,
		search?: string,
		page?: number,
	) {
		const tagCondition = tagSlug
			? exists(
					this.database
						.select()
						.from(newsTags)
						.innerJoin(tags, eq(newsTags.tagId, tags.id))
						.where(
							and(
								eq(newsTags.newsId, news.id),
								eq(tags.scopeId, scopeId),
								eq(tags.slug, tagSlug),
								isNull(tags.deletedAt),
							),
						),
				)
			: undefined;
		return this.listByTimestamp(
			and(eq(news.scopeId, scopeId), tagCondition),
			limit,
			cursor,
			false,
			lang,
			false,
			search,
			page,
		);
	}

	async findTranslation(newsId: string, lang: string) {
		const rows = await this.database
			.select()
			.from(newsTranslations)
			.where(and(eq(newsTranslations.newsId, newsId), isNull(newsTranslations.deletedAt)));
		return rows.find((row) => canonicalizeStoredLanguage(row.lang) === lang) ?? null;
	}

	async listTranslations(newsId: string) {
		return this.database
			.select()
			.from(newsTranslations)
			.where(and(eq(newsTranslations.newsId, newsId), isNull(newsTranslations.deletedAt)))
			.orderBy(asc(newsTranslations.lang));
	}
}
