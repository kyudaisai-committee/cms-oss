import { DatabaseSync } from "node:sqlite";

import type { AnyD1Database } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";

import { decodeCursor } from "#core/cursor";
import { createDb } from "#core/db.server";
import { createTestDatabase } from "#core/test/database";

import { CmsRepository } from "./repository.server";

type SqliteValue = null | number | bigint | string | NodeJS.ArrayBufferView;

class TestD1Statement {
	constructor(
		private readonly database: DatabaseSync,
		private readonly query: string,
		private readonly parameters: SqliteValue[] = [],
	) {}

	bind(...parameters: SqliteValue[]) {
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
	return { sqlite, repository: new CmsRepository(database) };
}

function audit(entityType: string, entityId: string) {
	return {
		actor: { type: "local" as const, id: "test", email: null, label: "Test" },
		action: `${entityType}.delete`,
		entityType,
		entityId,
		scopeId: "scope-1",
		changes: {},
		createdAt: new Date("2026-09-12T00:00:00.000Z"),
	};
}

function insertParentAndTranslation(sqlite: DatabaseSync, lang = "ja", id = "news-1") {
	sqlite.exec(`
		INSERT INTO scopes (id, year, site, name, available_languages, default_language, created_at, updated_at)
		VALUES ('scope-1', 2026, 'festival', 'Festival', '["ja", "en"]', 'ja', 1, 1);
		INSERT INTO news (id, scope_id, slug, created_at, updated_at, created_by, updated_by)
		VALUES ('${id}', 'scope-1', 'same', 1, 1, 'test', 'test');
		INSERT INTO news_translations
		(id, news_id, lang, title, summary, content, content_type, status, published_at, created_at, updated_at, created_by, updated_by)
		VALUES ('translation-${lang}', '${id}', '${lang}', '${lang} title', NULL, '${lang} body', 'markdown', 'published', 1, 1, 1, 'test', 'test');
	`);
}

function insertPaginationFixture(sqlite: DatabaseSync) {
	sqlite.exec(`
		INSERT INTO scopes (id, year, site, name, available_languages, default_language, created_at, updated_at)
		VALUES ('scope-1', 2026, 'festival', 'Festival', '["ja"]', 'ja', 1, 1);
		INSERT INTO news (id, scope_id, slug, created_at, updated_at, created_by, updated_by)
		VALUES
			('parent-a', 'scope-1', 'a', 1, 3000, 'test', 'test'),
			('parent-b', 'scope-1', 'b', 1, 2000, 'test', 'test'),
			('parent-c', 'scope-1', 'c', 1, 1000, 'test', 'test');
		INSERT INTO news_translations
		(id, news_id, lang, title, content, content_type, status, published_at, created_at, updated_at, created_by, updated_by)
		VALUES
			('translation-a', 'parent-a', 'ja', 'A', 'A', 'markdown', 'published', 5000, 1, 100, 'test', 'test'),
			('translation-b', 'parent-b', 'ja', 'B', 'B', 'markdown', 'published', 5000, 1, 5000, 'test', 'test'),
			('translation-c', 'parent-c', 'ja', 'C', 'C', 'markdown', 'published', 4000, 1, 50, 'test', 'test');
	`);
}

describe("CmsRepository", () => {
	it("returns an explicit parent and selected translation and resolves legacy translation IDs", async () => {
		const { sqlite, repository } = setup();
		insertParentAndTranslation(sqlite);
		const result = await repository.findNewsById("scope-1", "translation-ja");
		expect(result?.parent.id).toBe("news-1");
		expect(result?.translation.id).toBe("translation-ja");
		expect(result?.translation.title).toBe("ja title");
	});

	it("uses canonical language matching for legacy lowercase tags", async () => {
		const { sqlite, repository } = setup();
		insertParentAndTranslation(sqlite, "zh-hant", "news-zh");
		sqlite
			.prepare(
				"UPDATE scopes SET available_languages = '[\"zh-hant\"]', default_language = 'zh-hant'",
			)
			.run();
		const result = await repository.findNewsById("scope-1", "news-zh", "zh-Hant");
		expect(result?.translation.lang).toBe("zh-hant");
	});

	it("honors an explicit language when resolving a legacy translation ID", async () => {
		const { sqlite, repository } = setup();
		insertParentAndTranslation(sqlite);
		sqlite.exec(`
			INSERT INTO news_translations
			(id, news_id, lang, title, summary, content, content_type, status, published_at, created_at, updated_at, created_by, updated_by)
			VALUES ('translation-en', 'news-1', 'en', 'English title', NULL, 'English body', 'markdown', 'draft', NULL, 2, 2, 'test', 'test');
		`);

		const result = await repository.findNewsById("scope-1", "translation-ja", "en");

		expect(result?.parent.id).toBe("news-1");
		expect(result?.translation.lang).toBe("en");
		expect(result?.translation.title).toBe("English title");
	});

	it("filters deleted relations and keeps article-level unique slugs", async () => {
		const { sqlite, repository } = setup();
		insertParentAndTranslation(sqlite);
		sqlite.exec(`
			INSERT INTO tags (id, scope_id, name, slug, deleted_at)
			VALUES ('tag-active', 'scope-1', 'Active', 'active', NULL), ('tag-deleted', 'scope-1', 'Deleted', 'deleted', 2);
			INSERT INTO news_tags (news_id, tag_id) VALUES ('news-1', 'tag-active'), ('news-1', 'tag-deleted');
		`);
		const page = await repository.listAdmin("scope-1", 10, null);
		expect(page.items[0]?.parent.id).toBe("news-1");
		expect(page.items[0]?.tags).toEqual([expect.objectContaining({ id: "tag-active" })]);
		expect(() =>
			sqlite
				.prepare(
					"INSERT INTO news (id, scope_id, slug, created_at, updated_at, created_by, updated_by) VALUES ('news-2', 'scope-1', 'same', 1, 1, 'test', 'test')",
				)
				.run(),
		).toThrow();
		await repository.deleteNews("news-1", audit("news", "news-1"));
		expect(await repository.findNewsById("scope-1", "news-1")).toBeNull();
	});

	it("updates tags without building an empty parent update", async () => {
		const { sqlite, repository } = setup();
		insertParentAndTranslation(sqlite);
		sqlite.exec(
			"INSERT INTO tags (id, scope_id, name, slug, deleted_at) VALUES ('tag-active', 'scope-1', 'Active', 'active', NULL)",
		);

		await repository.updateNews("news-1", {}, ["tag-active"], audit("news", "news-1"));

		const result = await repository.findNewsById("scope-1", "news-1");
		expect(result?.tags).toEqual([expect.objectContaining({ id: "tag-active" })]);
	});

	it("paginates admin results by the parent updated tuple", async () => {
		const { sqlite, repository } = setup();
		insertPaginationFixture(sqlite);
		const ids: string[] = [];
		let cursor: string | null = null;
		do {
			const page = await repository.listAdmin("scope-1", 1, decodeCursor(cursor ?? undefined));
			ids.push(...page.items.map((item) => item.parent.id));
			cursor = page.nextCursor;
		} while (cursor);
		expect(ids).toEqual(["parent-a", "parent-b", "parent-c"]);
	});

	it("filters admin search matches before applying each cursor page", async () => {
		const { sqlite, repository } = setup();
		insertPaginationFixture(sqlite);
		sqlite.exec(`
			UPDATE news_translations SET title = 'Needle in title' WHERE id = 'translation-a';
			UPDATE news_translations SET summary = 'Needle in summary' WHERE id = 'translation-b';
			UPDATE news SET slug = 'needle-slug' WHERE id = 'parent-c';
		`);

		const firstPage = await repository.listAdmin(
			"scope-1",
			1,
			null,
			undefined,
			undefined,
			" needle ",
		);
		const secondPage = await repository.listAdmin(
			"scope-1",
			1,
			decodeCursor(firstPage.nextCursor ?? undefined),
			undefined,
			undefined,
			"needle",
		);
		const thirdPage = await repository.listAdmin(
			"scope-1",
			1,
			decodeCursor(secondPage.nextCursor ?? undefined),
			undefined,
			undefined,
			"needle",
		);

		expect(firstPage.items.map((item) => item.parent.id)).toEqual(["parent-a"]);
		expect(firstPage.nextCursor).not.toBeNull();
		expect(secondPage.items.map((item) => item.parent.id)).toEqual(["parent-b"]);
		expect(secondPage.nextCursor).not.toBeNull();
		expect(thirdPage.items.map((item) => item.parent.id)).toEqual(["parent-c"]);
		expect(thirdPage.nextCursor).toBeNull();
	});

	it("returns a directly requested admin page and filtered total count", async () => {
		const { sqlite, repository } = setup();
		insertPaginationFixture(sqlite);
		sqlite.exec(`
			UPDATE news_translations SET title = 'Needle in title' WHERE id IN ('translation-a', 'translation-b');
		`);

		const secondPage = await repository.listAdmin(
			"scope-1",
			1,
			null,
			undefined,
			undefined,
			"needle",
			2,
		);
		const outOfRangePage = await repository.listAdmin(
			"scope-1",
			1,
			null,
			undefined,
			undefined,
			"needle",
			3,
		);

		expect(secondPage.items.map((item) => item.parent.id)).toEqual(["parent-b"]);
		expect(secondPage.totalCount).toBe(2);
		expect(outOfRangePage.items).toEqual([]);
		expect(outOfRangePage.totalCount).toBe(2);
	});

	it("paginates published results by publishedAt and parent ID", async () => {
		const { sqlite, repository } = setup();
		insertPaginationFixture(sqlite);
		const ids: string[] = [];
		let cursor: string | null = null;
		do {
			const page = await repository.listPublished(
				"scope-1",
				1,
				decodeCursor(cursor ?? undefined),
				undefined,
				"ja",
			);
			ids.push(...page.items.map((item) => item.parent.id));
			cursor = page.nextCursor;
		} while (cursor);
		expect(ids).toEqual(["parent-b", "parent-a", "parent-c"]);
	});
});
