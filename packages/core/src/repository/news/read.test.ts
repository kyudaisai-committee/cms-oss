import { DatabaseSync } from "node:sqlite";

import type { AnyD1Database } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";

import { decodeCursor } from "#core/cursor";
import { createDb } from "#core/db.server";
import { createTestDatabase } from "#core/test/database";

import { NewsReadRepository } from "./read.server";

type SqliteValue = null | number | bigint | string | NodeJS.ArrayBufferView;

class TestD1Statement {
	constructor(
		private readonly database: DatabaseSync,
		private readonly query: string,
		private readonly parameters: SqliteValue[] = [],
	) {}

	bind(...parameters: SqliteValue[]) {
		if (parameters.length > 100) throw new Error("D1 supports at most 100 bound values.");
		return new TestD1Statement(this.database, this.query, parameters);
	}

	run() {
		const result = this.database.prepare(this.query).run(...this.parameters);
		return {
			success: true,
			meta: { changes: Number(result.changes), last_row_id: 0, duration: 0 },
		};
	}

	all() {
		return { results: this.database.prepare(this.query).all(...this.parameters) };
	}

	raw() {
		return this.database.prepare(this.query, { returnArrays: true }).all(...this.parameters);
	}
}

class TestD1Database {
	constructor(readonly database: DatabaseSync) {}

	prepare(query: string) {
		return new TestD1Statement(this.database, query);
	}

	batch(statements: TestD1Statement[]) {
		return Promise.resolve(statements.map((statement) => statement.run()));
	}
}

function setup() {
	const sqlite = createTestDatabase();
	const database = createDb(new TestD1Database(sqlite) as unknown as AnyD1Database);
	return { sqlite, repository: new NewsReadRepository(database) };
}

function insertNewsFixtures(sqlite: DatabaseSync, count: number) {
	const now = Date.now();
	sqlite
		.prepare(
			"INSERT INTO scopes (id, year, site, name, available_languages, default_language, created_at, updated_at) VALUES ('scope-1', 2026, 'festival', 'Festival', '[\"ja\", \"en\"]', 'ja', ?, ?)",
		)
		.run(now, now);
	sqlite
		.prepare(
			"INSERT INTO tags (id, scope_id, name, slug) VALUES ('tag-featured', 'scope-1', 'Featured', 'featured')",
		)
		.run();
	const insertNews = sqlite.prepare(
		"INSERT INTO news (id, scope_id, slug, created_at, updated_at, created_by, updated_by) VALUES (?, 'scope-1', ?, ?, ?, 'test', 'test')",
	);
	const insertTranslation = sqlite.prepare(
		"INSERT INTO news_translations (id, news_id, lang, title, summary, content, content_type, status, published_at, created_at, updated_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, 'markdown', 'published', ?, ?, ?, 'test', 'test')",
	);
	const insertTag = sqlite.prepare(
		"INSERT INTO news_tags (news_id, tag_id) VALUES (?, 'tag-featured')",
	);
	const publishedAt = now - count * 1000;

	for (let index = 0; index < count; index += 1) {
		const suffix = String(index).padStart(3, "0");
		const newsId = `news-${suffix}`;
		const timestamp = publishedAt + index * 1000;
		insertNews.run(newsId, `article-${suffix}`, now, timestamp);
		insertTranslation.run(
			`translation-ja-${suffix}`,
			newsId,
			"ja",
			`記事 ${suffix}`,
			null,
			"本文",
			timestamp,
			now,
			timestamp,
		);
		insertTranslation.run(
			`translation-en-${suffix}`,
			newsId,
			"EN",
			index >= count - 3 ? `Needle ${suffix}` : `Article ${suffix}`,
			null,
			"Content",
			timestamp,
			now,
			timestamp,
		);
		if (index >= count - 7 && index % 2 === 1) insertTag.run(newsId);
	}
}

describe("NewsReadRepository lists", () => {
	it("loads related data for large lists within D1's bind limit", async () => {
		const { sqlite, repository } = setup();
		insertNewsFixtures(sqlite, 120);

		const defaultLanguagePage = await repository.listAdmin(
			"scope-1",
			2,
			null,
			undefined,
			undefined,
			undefined,
			2,
		);
		const filteredLanguagePage = await repository.listAdmin(
			"scope-1",
			1,
			null,
			"featured",
			"en",
			" needle ",
			2,
		);

		expect(defaultLanguagePage.items.map((item) => item.parent.id)).toEqual([
			"news-117",
			"news-116",
		]);
		expect(defaultLanguagePage.items[0]?.translation.lang).toBe("ja");
		expect(defaultLanguagePage.totalCount).toBe(120);
		expect(filteredLanguagePage.items.map((item) => item.parent.id)).toEqual(["news-117"]);
		expect(filteredLanguagePage.items[0]?.translation.title).toBe("Needle 117");
		expect(filteredLanguagePage.items[0]?.tags).toEqual([
			expect.objectContaining({ id: "tag-featured" }),
		]);
		expect(filteredLanguagePage.totalCount).toBe(2);

		const publishedIds: string[] = [];
		let cursor: string | null = null;
		do {
			const page = await repository.listPublished(
				"scope-1",
				50,
				decodeCursor(cursor ?? undefined),
				undefined,
				"en",
			);
			publishedIds.push(...page.items.map((item) => item.parent.id));
			cursor = page.nextCursor;
		} while (cursor !== null);

		expect(publishedIds).toHaveLength(120);
		expect(publishedIds.slice(0, 3)).toEqual(["news-119", "news-118", "news-117"]);
		expect(publishedIds.slice(-3)).toEqual(["news-002", "news-001", "news-000"]);

		const taggedPublishedPage = await repository.listPublished(
			"scope-1",
			2,
			null,
			"featured",
			"en",
		);
		expect(taggedPublishedPage.items.map((item) => item.parent.id)).toEqual([
			"news-119",
			"news-117",
		]);
	});
});
