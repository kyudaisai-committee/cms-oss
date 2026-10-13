import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { Database } from "#core/db.server";
import { news, newsTags, newsTranslations } from "#core/db/schema";
import type { AuditEntry } from "#core/types";

import { createAuditStatement, executeBatch } from "../shared.server";

type NewsRecord = InferSelectModel<typeof news>;
type NewsTranslationRecord = InferSelectModel<typeof newsTranslations>;

export class NewsWriteRepository {
	constructor(private readonly database: Database) {}

	async insertNewsWithTranslation(
		newsItem: NewsRecord,
		translation: NewsTranslationRecord,
		tagIds: string[],
		audits: AuditEntry[],
	) {
		await executeBatch(this.database, [
			this.database.insert(news).values(newsItem),
			this.database.insert(newsTranslations).values(translation),
			...tagIds.map((tagId) =>
				this.database.insert(newsTags).values({ newsId: newsItem.id, tagId }),
			),
			...audits.map((audit) => createAuditStatement(this.database, audit)),
		]);
	}

	async insertTranslationAndParent(
		translation: NewsTranslationRecord,
		newsId: string,
		parentValues: Partial<NewsRecord>,
		audit: AuditEntry,
	) {
		await executeBatch(this.database, [
			this.database.insert(newsTranslations).values(translation),
			this.database
				.update(news)
				.set(parentValues)
				.where(and(eq(news.id, newsId), isNull(news.deletedAt))),
			createAuditStatement(this.database, audit),
		]);
	}

	async updateTranslationAndParent(
		translationId: string,
		newsId: string,
		translationValues: Partial<NewsTranslationRecord>,
		parentValues: Partial<NewsRecord>,
		audit: AuditEntry,
	) {
		await executeBatch(this.database, [
			this.database
				.update(newsTranslations)
				.set(translationValues)
				.where(and(eq(newsTranslations.id, translationId), isNull(newsTranslations.deletedAt))),
			this.database
				.update(news)
				.set(parentValues)
				.where(and(eq(news.id, newsId), isNull(news.deletedAt))),
			createAuditStatement(this.database, audit),
		]);
	}

	async updateNews(
		id: string,
		values: Partial<NewsRecord>,
		tagIds: string[] | undefined,
		audit: AuditEntry,
	) {
		const statements: BatchItem<"sqlite">[] = [];
		if (Object.keys(values).length > 0)
			statements.push(
				this.database
					.update(news)
					.set(values)
					.where(and(eq(news.id, id), isNull(news.deletedAt))),
			);
		if (tagIds !== undefined) {
			statements.push(
				this.database.delete(newsTags).where(eq(newsTags.newsId, id)),
				...tagIds.map((tagId) => this.database.insert(newsTags).values({ newsId: id, tagId })),
			);
		}
		statements.push(createAuditStatement(this.database, audit));
		await executeBatch(this.database, statements);
	}

	async deleteNews(id: string, audit: AuditEntry) {
		await executeBatch(this.database, [
			this.database
				.update(news)
				.set({ deletedAt: new Date() })
				.where(and(eq(news.id, id), isNull(news.deletedAt))),
			createAuditStatement(this.database, audit),
		]);
	}
}
