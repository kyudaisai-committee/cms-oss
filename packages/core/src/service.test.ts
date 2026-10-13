import { DatabaseSync } from "node:sqlite";

import type { AnyD1Database } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";

import { createDb } from "#core/db.server";
import { CmsRepository } from "#core/repository.server";
import { createTestDatabase } from "#core/test/database";
import type { CmsActor, CreateNewsInput } from "#core/types";

import { CmsService } from "./service.server";

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

const actor: CmsActor = {
	type: "local",
	id: "service-test",
	email: null,
	label: "Service test",
};

async function createTestService() {
	const sqlite = createTestDatabase();
	const database = createDb(new TestD1Database(sqlite) as unknown as AnyD1Database);
	await CmsService.ensureScope(
		database,
		actor,
		{ year: 2026, site: "festival" },
		"Festival",
		["ja", "en"],
		"ja",
	);
	const repository = new CmsRepository(database);
	const scope = await repository.findScope({ year: 2026, site: "festival" });
	if (!scope) throw new Error("Test scope was not created.");
	return new CmsService(database, actor, scope);
}

async function createExportTestContext() {
	const sqlite = createTestDatabase();
	const database = createDb(new TestD1Database(sqlite) as unknown as AnyD1Database);
	await CmsService.ensureScope(
		database,
		actor,
		{ year: 2026, site: "festival" },
		"Festival",
		["ja", "en"],
		"ja",
	);
	await CmsService.ensureScope(
		database,
		actor,
		{ year: 2027, site: "committee" },
		"Committee",
		["ja"],
		"ja",
	);
	await CmsService.ensureScope(
		database,
		actor,
		{ year: 2028, site: "festival" },
		"Empty festival",
		["ja"],
		"ja",
	);
	const repository = new CmsRepository(database);
	const scope = await repository.findScope({ year: 2026, site: "festival" });
	const committeeScope = await repository.findScope({ year: 2027, site: "committee" });
	if (!scope) throw new Error("Test scope was not created.");
	if (!committeeScope) throw new Error("Committee scope was not created.");
	return {
		committeeScopeId: committeeScope.id,
		database,
		festivalScopeId: scope.id,
		service: new CmsService(database, actor, scope),
		sqlite,
	};
}

function newsInput(lang: string, title: string): CreateNewsInput {
	return {
		slug: "welcome",
		lang,
		title,
		contentType: "markdown",
		content: `${title} content`,
	};
}

describe("CmsService news translations", () => {
	it("rejects creating a second article with an existing slug", async () => {
		const service = await createTestService();
		const japanese = await service.createNews(newsInput("ja", "日本語のお知らせ"));

		await expect(service.createNews(newsInput("en", "English notice"))).rejects.toMatchObject({
			status: 409,
		});
		expect(japanese.lang).toBe("ja");
	});

	it("returns the requested language for an existing parent", async () => {
		const service = await createTestService();
		const japanese = await service.createNews(newsInput("ja", "日本語のお知らせ"));
		await service.createNewsTranslation(japanese.id, "en", {
			title: "English notice",
			contentType: "markdown",
			content: "English notice content",
		});

		const english = await service.getAdminNews(japanese.id, "en");

		expect(english.lang).toBe("en");
		expect(english.title).toBe("English notice");
	});

	it("updates only the selected translation", async () => {
		const service = await createTestService();
		const japanese = await service.createNews(newsInput("ja", "日本語のお知らせ"));
		await service.createNewsTranslation(japanese.id, "en", {
			title: "English notice",
			contentType: "markdown",
			content: "English notice content",
		});

		const english = await service.updateNewsTranslation(japanese.id, "en", {
			title: "Updated English notice",
			contentType: "markdown",
			content: "Updated English content",
		});
		const unchangedJapanese = await service.getAdminNews(japanese.id, "ja");

		expect(english.lang).toBe("en");
		expect(english.title).toBe("Updated English notice");
		expect(unchangedJapanese.title).toBe("日本語のお知らせ");
	});

	it("distinguishes a missing language from the parent default translation", async () => {
		const service = await createTestService();
		const japanese = await service.createNews(newsInput("ja", "日本語のお知らせ"));

		await expect(service.getAdminNews(japanese.id, "en")).rejects.toMatchObject({ status: 404 });
		const fallback = await service.getAdminNews(japanese.id);

		expect(fallback.id).toBe(japanese.id);
		expect(fallback.lang).toBe("ja");
		expect(fallback.title).toBe("日本語のお知らせ");
		expect(fallback.translations).not.toEqual(
			expect.arrayContaining([expect.objectContaining({ lang: "en" })]),
		);
	});

	it("updates parent metadata before creating a translation", async () => {
		const service = await createTestService();
		const japanese = await service.createNews(newsInput("ja", "日本語のお知らせ"));
		const tag = await service.createTag({ name: "重要", slug: "important" });
		const beforeJapanese = await service.getAdminNews(japanese.id, "ja");
		const beforeAudits = await service.listAuditLogs();

		await service.updateNews(japanese.id, { slug: "welcome-updated", tagIds: [tag.id] });

		const afterJapanese = await service.getAdminNews(japanese.id, "ja");
		const afterAudits = await service.listAuditLogs();
		expect(afterJapanese.updatedAt).toBe(beforeJapanese.updatedAt);
		expect(afterJapanese.slug).toBe("welcome-updated");
		expect(afterJapanese.tags).toEqual([expect.objectContaining({ id: tag.id })]);
		expect(afterAudits.filter((audit) => audit.action === "news.update")).toHaveLength(
			beforeAudits.filter((audit) => audit.action === "news.update").length + 1,
		);
		expect(afterAudits.filter((audit) => audit.action === "news.translation.update")).toHaveLength(
			beforeAudits.filter((audit) => audit.action === "news.translation.update").length,
		);

		const english = await service.createNewsTranslation(japanese.id, "en", {
			title: "English notice",
			contentType: "markdown",
			content: "English notice content",
		});

		expect(english.id).toBe(japanese.id);
		expect(english.slug).toBe("welcome-updated");
		expect(english.lang).toBe("en");
		expect(english.title).toBe("English notice");
	});

	it("returns the selected language when publishing and reverting a translation", async () => {
		const service = await createTestService();
		const japanese = await service.createNews(newsInput("ja", "日本語のお知らせ"));
		await service.createNewsTranslation(japanese.id, "en", {
			title: "English notice",
			contentType: "markdown",
			content: "English notice content",
		});

		const published = await service.publishNewsTranslation(japanese.id, "en");
		expect(published.lang).toBe("en");
		expect(published.status).toBe("published");

		const unpublished = await service.unpublishNewsTranslation(japanese.id, "en");
		expect(unpublished.lang).toBe("en");
		expect(unpublished.status).toBe("draft");
	});
});

describe("CMS data export", () => {
	it("exports every active scope and news item with translations, tags, and publication state", async () => {
		const { committeeScopeId, database, festivalScopeId, service, sqlite } =
			await createExportTestContext();
		const insertNews = sqlite.prepare(
			"INSERT INTO news (id, scope_id, slug, created_at, updated_at, deleted_at, created_by, updated_by) VALUES (?, ?, ?, 1, 1, ?, 'editor', 'editor')",
		);
		const insertTranslation = sqlite.prepare(
			"INSERT INTO news_translations (id, news_id, lang, title, summary, content, content_type, status, published_at, created_at, updated_at, deleted_at, created_by, updated_by) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, 1, 1, ?, 'editor', 'editor')",
		);
		for (let index = 0; index < 125; index += 1) {
			const suffix = String(index).padStart(3, "0");
			const newsId = `news-${suffix}`;
			insertNews.run(newsId, festivalScopeId, `notice-${suffix}`, null);
			insertTranslation.run(
				`translation-${suffix}-ja`,
				newsId,
				"ja",
				`Notice ${suffix}`,
				`# Notice ${suffix}`,
				"markdown",
				index % 2 === 0 ? "published" : "draft",
				index % 2 === 0 ? 1_800_000_000_000 : null,
				null,
			);
		}
		insertTranslation.run(
			"translation-000-en",
			"news-000",
			"en",
			"English notice",
			"https://example.com/notice",
			"link",
			"published",
			4_102_444_800_000,
			null,
		);
		insertNews.run("deleted-news", festivalScopeId, "deleted-notice", 1);
		insertTranslation.run(
			"deleted-translation",
			"deleted-news",
			"ja",
			"Deleted",
			"# Deleted",
			"markdown",
			"published",
			1,
			null,
		);
		insertTranslation.run(
			"deleted-language",
			"news-001",
			"en",
			"Deleted English",
			"# Deleted English",
			"markdown",
			"draft",
			null,
			1,
		);
		const insertTag = sqlite.prepare(
			"INSERT INTO tags (id, scope_id, name, slug, deleted_at) VALUES (?, ?, ?, ?, ?)",
		);
		insertTag.run("tag-active", festivalScopeId, "Important", "important", null);
		insertTag.run("tag-deleted", festivalScopeId, "Deleted", "deleted", 1);
		insertTag.run("tag-other-scope", committeeScopeId, "Other scope", "other", null);
		const insertTagRelation = sqlite.prepare(
			"INSERT INTO news_tags (news_id, tag_id) VALUES ('news-000', ?)",
		);
		insertTagRelation.run("tag-active");
		insertTagRelation.run("tag-deleted");
		insertTagRelation.run("tag-other-scope");

		const exported = await CmsService.exportAll(database);

		expect(exported).toHaveLength(3);
		expect(exported.map((item) => [item.scope.year, item.scope.site])).toEqual([
			[2026, "festival"],
			[2027, "committee"],
			[2028, "festival"],
		]);
		const festival = exported[0];
		const committee = exported[1];
		const empty = exported[2];
		expect(festival).toBeDefined();
		expect(committee).toMatchObject({ tags: [{ name: "Other scope", slug: "other" }], news: [] });
		expect(empty).toMatchObject({ tags: [], news: [] });
		if (!festival) throw new Error("Festival export is missing.");
		expect(festival.version).toBe(1);
		expect(Object.keys(festival)).not.toContain("format");
		expect(festival.news).toHaveLength(125);
		expect(festival.tags).toEqual([{ name: "Important", slug: "important" }]);
		expect(festival.news[0]).toMatchObject({
			slug: "notice-000",
			tags: ["important"],
			translations: [
				{
					lang: "en",
					contentType: "link",
					content: "https://example.com/notice",
					status: "published",
					publishedAt: new Date(4_102_444_800_000).toISOString(),
				},
				{
					lang: "ja",
					contentType: "markdown",
					content: "# Notice 000",
					status: "published",
					publishedAt: new Date(1_800_000_000_000).toISOString(),
				},
			],
		});
		expect(festival.news[1]?.slug).toBe("notice-001");
		expect(festival.news[1]?.translations.map((translation) => translation.lang)).toEqual(["ja"]);
		expect(festival.news.some((item) => item.slug === "deleted-notice")).toBe(false);
		expect(Object.keys(festival.news[0]?.translations[0] ?? {})).not.toContain("id");
		expect(await service.exportScope()).toHaveLength(1);
	});
});
