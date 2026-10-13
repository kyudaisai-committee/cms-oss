import { DatabaseSync } from "node:sqlite";

import { eq } from "drizzle-orm";
import type { AnyD1Database } from "drizzle-orm/d1";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createDb } from "#core/db.server";
import { scopes } from "#core/db/schema";
import { CmsRepository } from "#core/repository.server";
import { createTestDatabase } from "#core/test/database";
import type { CmsActor, DataImportRequest, ScopeDataExport } from "#core/types";

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
		const changes = this.database.prepare(this.query).run(...this.parameters).changes;
		return {
			success: true,
			meta: { changes: Number(changes), last_row_id: 0, duration: 0 },
		};
	}

	all() {
		return { results: this.database.prepare(this.query).all(...this.parameters) };
	}

	raw() {
		return this.database.prepare(this.query, { returnArrays: true }).all(...this.parameters);
	}
}

class TransactionalTestD1Database {
	constructor(readonly database: DatabaseSync) {}

	prepare(query: string) {
		return new TestD1Statement(this.database, query);
	}

	async batch(statements: TestD1Statement[]) {
		this.database.exec("BEGIN IMMEDIATE");
		try {
			const results = statements.map((statement) => statement.run());
			this.database.exec("COMMIT");
			return results;
		} catch (error) {
			this.database.exec("ROLLBACK");
			throw error;
		}
	}
}

const actor: CmsActor = {
	type: "user",
	id: "import-test-user",
	email: "editor@example.com",
	label: "Import test editor",
};

async function createImportContext() {
	const sqlite = createTestDatabase();
	const database = createDb(new TransactionalTestD1Database(sqlite) as unknown as AnyD1Database);
	await CmsService.ensureScope(
		database,
		actor,
		{ year: 2026, site: "festival" },
		"Festival target",
		["ja", "en"],
		"ja",
	);
	await CmsService.ensureScope(
		database,
		{ ...actor, id: "source-actor" },
		{ year: 2027, site: "committee" },
		"Committee source",
		["ja", "en"],
		"en",
	);
	await CmsService.ensureScope(
		database,
		actor,
		{ year: 2028, site: "committee" },
		"Other scope",
		["ja"],
		"ja",
	);
	const repository = new CmsRepository(database);
	const targetScope = await repository.findScope({ year: 2026, site: "festival" });
	if (!targetScope) throw new Error("Target scope was not created.");
	return { database, repository, service: new CmsService(database, actor, targetScope), sqlite };
}

function makeTranslation(
	lang: string,
	title: string,
	options: {
		contentType?: "markdown" | "link";
		content?: string;
		status?: "draft" | "published";
		publishedAt?: string | null;
	} = {},
) {
	const contentType = options.contentType ?? "markdown";
	return {
		lang,
		title,
		summary: null,
		contentType,
		content:
			options.content ??
			(contentType === "link" ? "https://example.com/notices" : `# ${title}\n\nBody`),
		status: options.status ?? "draft",
		publishedAt: options.publishedAt ?? null,
	};
}

function makeSource(
	newsItems: ScopeDataExport["news"],
	tags: ScopeDataExport["tags"] = [],
	options: {
		year?: number;
		site?: string;
		name?: string;
		availableLanguages?: string[];
		defaultLanguage?: string;
	} = {},
): ScopeDataExport {
	return {
		version: 1,
		exportedAt: "2026-10-05T03:00:00.000Z",
		scope: {
			year: options.year ?? 2027,
			site: options.site ?? "committee",
			name: options.name ?? "Committee source",
			availableLanguages: options.availableLanguages ?? ["ja", "en"],
			defaultLanguage: options.defaultLanguage ?? "en",
		},
		tags,
		news: newsItems,
	};
}

function makeRequest(
	source: ScopeDataExport,
	options: Partial<Pick<DataImportRequest, "newsDecisions" | "languageDecisions">> = {},
): DataImportRequest {
	return {
		source,
		newsDecisions: options.newsDecisions ?? [],
		languageDecisions: options.languageDecisions ?? [],
	};
}

function rowCount(sqlite: DatabaseSync, table: string, where = "", ...parameters: SqliteValue[]) {
	const query = `SELECT COUNT(*) AS count FROM ${table}${where ? ` WHERE ${where}` : ""}`;
	const row = sqlite.prepare(query).get(...parameters) as { count: number };
	return Number(row.count);
}

function article(
	slug: string,
	translations: ReturnType<typeof makeTranslation>[] = [makeTranslation("ja", slug)],
	tags: string[] = [],
) {
	return { slug, tags, translations };
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("data import planning and commit", () => {
	it("previews without writes, then imports every item from the selected scope and preserves publication data", async () => {
		const { repository, service, sqlite } = await createImportContext();
		const existingBySlug = await service.createTag({ name: "Target label", slug: "shared-tag" });
		const existingByName = await service.createTag({
			name: "Reusable by name",
			slug: "target-name",
		});
		const newsItems = Array.from({ length: 125 }, (_, index) =>
			article(
				`post-${index + 1}`,
				[
					makeTranslation("ja", `下書き ${index + 1}`, {
						content: `# 見出し ${index + 1}\n\n[案内](https://example.com/${index + 1})`,
					}),
					makeTranslation("en", `Notice ${index + 1}`, {
						contentType: "link",
						content: `https://example.com/notices/${index + 1}`,
						status: "published",
						publishedAt: "2026-10-03T09:30:00.000Z",
					}),
				],
				index % 2 === 0 ? ["shared-tag", "source-name"] : ["shared-tag"],
			),
		);
		const source = makeSource(
			newsItems,
			[
				{ name: "Source label", slug: "shared-tag" },
				{ name: "Reusable by name", slug: "source-name" },
				{ name: "Unused source tag", slug: "unused-source-tag" },
			],
			{ year: 2040, site: "source-only", name: "Source identity", defaultLanguage: "en" },
		);
		const request = makeRequest(source);

		const preview = await service.previewDataImport(request);

		expect(preview.plan.ready).toBe(true);
		expect(preview.targetCurrent.scope).toMatchObject({
			year: 2026,
			site: "festival",
			name: "Festival target",
			availableLanguages: ["ja", "en"],
			defaultLanguage: "ja",
		});
		expect(preview.plan.summary).toEqual({
			newsToCreate: 125,
			newsToSkip: 0,
			translationsToCreate: 250,
			tagsToCreate: 1,
			tagsToReuse: 2,
			languagesToAdd: 0,
		});
		expect(rowCount(sqlite, "news")).toBe(0);
		expect(rowCount(sqlite, "tags")).toBe(2);
		expect(rowCount(sqlite, "audit_logs", "action = ?", "data.import")).toBe(0);

		const result = await service.importData({
			...request,
			expectedPreviewToken: preview.previewToken,
		});

		expect(result).toMatchObject({
			createdNews: 125,
			skippedNews: 0,
			createdTranslations: 250,
			createdTags: 1,
			reusedTags: 2,
		});
		expect(rowCount(sqlite, "news")).toBe(125);
		expect(rowCount(sqlite, "news_translations")).toBe(250);
		expect(rowCount(sqlite, "tags")).toBe(3);
		expect(rowCount(sqlite, "news_tags")).toBe(188);
		expect(rowCount(sqlite, "audit_logs", "action = ?", "data.import")).toBe(1);
		const targetScope = await repository.findScope({ year: 2026, site: "festival" });
		if (!targetScope) throw new Error("Target scope was not created.");
		expect(rowCount(sqlite, "news", "scope_id != ?", targetScope.id)).toBe(0);
		expect(rowCount(sqlite, "news", "slug = ?", "post-125")).toBe(1);

		const firstArticle = sqlite
			.prepare("SELECT id, scope_id, created_by FROM news WHERE slug = ?")
			.get("post-1") as { id: string; scope_id: string; created_by: string };
		const importedScope = await repository.findScope({ year: 2026, site: "festival" });
		expect(firstArticle.scope_id).toBe(importedScope?.id);
		expect(firstArticle.created_by).toBe(actor.label);
		const translations = sqlite
			.prepare(
				"SELECT lang, content_type, status, content, published_at, created_by FROM news_translations WHERE news_id = ? ORDER BY lang",
			)
			.all(firstArticle.id) as Array<{
			lang: string;
			content_type: string;
			status: string;
			content: string;
			published_at: number | null;
			created_by: string;
		}>;
		expect(translations).toEqual([
			{
				lang: "en",
				content_type: "link",
				status: "published",
				content: "https://example.com/notices/1",
				published_at: new Date("2026-10-03T09:30:00.000Z").getTime(),
				created_by: actor.label,
			},
			{
				lang: "ja",
				content_type: "markdown",
				status: "draft",
				content: "# 見出し 1\n\n[案内](https://example.com/1)",
				published_at: null,
				created_by: actor.label,
			},
		]);
		const tagLinks = sqlite
			.prepare(
				"SELECT tags.id, tags.name, tags.slug FROM news_tags JOIN tags ON tags.id = news_tags.tag_id WHERE news_tags.news_id = ? ORDER BY tags.slug",
			)
			.all(firstArticle.id) as Array<{ id: string; name: string; slug: string }>;
		expect(tagLinks).toContainEqual({
			id: existingBySlug.id,
			name: "Target label",
			slug: "shared-tag",
		});
		expect(tagLinks).toContainEqual({
			id: existingByName.id,
			name: "Reusable by name",
			slug: "target-name",
		});
		const targetAfter = await repository.findScope({ year: 2026, site: "festival" });
		const untouchedOtherScope = await repository.findScope({ year: 2028, site: "committee" });
		expect(targetAfter).toMatchObject({
			name: "Festival target",
			availableLanguages: ["ja", "en"],
			defaultLanguage: "ja",
		});
		expect(untouchedOtherScope?.name).toBe("Other scope");
	});

	it("skips existing articles and auto-renames around existing and incoming suffixes", async () => {
		const { service, sqlite } = await createImportContext();
		const existing = await service.createNews({
			slug: "article",
			lang: "ja",
			title: "Keep this article",
			contentType: "markdown",
			content: "Original content",
		});
		await service.createNews({
			slug: "article-3",
			lang: "ja",
			title: "Existing suffix",
			contentType: "markdown",
			content: "Existing content",
		});
		const source = makeSource([
			article("article", [makeTranslation("ja", "Imported copy")]),
			article("article-2", [makeTranslation("ja", "Incoming suffix")]),
		]);

		const skipRequest = makeRequest(source, {
			newsDecisions: [{ newsIndex: 0, action: "skip" }],
		});
		const skipPreview = await service.previewDataImport(skipRequest);
		expect(skipPreview.plan.news.map((item) => item.action)).toEqual(["skip", "create"]);
		expect(skipPreview.plan.summary.newsToSkip).toBe(1);
		expect(rowCount(sqlite, "news")).toBe(2);

		const autoRequest = makeRequest(source, {
			newsDecisions: [{ newsIndex: 0, action: "rename", mode: "auto" }],
		});
		const autoPreview = await service.previewDataImport(autoRequest);
		expect(autoPreview.plan.news.map((item) => item.targetSlug)).toEqual([
			"article-4",
			"article-2",
		]);
		const autoResult = await service.importData({
			...autoRequest,
			expectedPreviewToken: autoPreview.previewToken,
		});
		expect(autoResult.newsSlugs).toEqual([
			{ sourceSlug: "article", targetSlug: "article-4" },
			{ sourceSlug: "article-2", targetSlug: "article-2" },
		]);
		const kept = sqlite.prepare("SELECT id, slug FROM news WHERE id = ?").get(existing.id) as {
			id: string;
			slug: string;
		};
		expect(kept).toEqual({ id: existing.id, slug: "article" });
	});

	it("deduplicates article links when distinct source tags resolve to the same target tag", async () => {
		const { service, sqlite } = await createImportContext();
		await service.createTag({ name: "Second source name", slug: "first" });
		const source = makeSource(
			[article("combined-tags", [makeTranslation("ja", "Combined")], ["first", "second"])],
			[
				{ name: "First source name", slug: "first" },
				{ name: "Second source name", slug: "second" },
			],
		);
		const request = makeRequest(source);

		const preview = await service.previewDataImport(request);
		expect(preview.plan.ready).toBe(true);
		expect(preview.plan.summary.tagsToReuse).toBe(2);

		const result = await service.importData({
			...request,
			expectedPreviewToken: preview.previewToken,
		});

		expect(result.createdNews).toBe(1);
		expect(rowCount(sqlite, "news_tags")).toBe(1);
		expect(rowCount(sqlite, "tags")).toBe(1);
	});

	it("requires valid per-duplicate manual slugs and rejects collisions with other source entries", async () => {
		const { service } = await createImportContext();
		await service.createNews({
			slug: "welcome",
			lang: "ja",
			title: "Existing",
			contentType: "markdown",
			content: "Existing content",
		});
		const source = makeSource([
			article("welcome", [makeTranslation("ja", "Imported")]),
			article("used-by-another", [makeTranslation("ja", "Other")]),
		]);
		const incomplete = makeRequest(source, {
			newsDecisions: [{ newsIndex: 0, action: "rename", mode: "manual", targetSlug: null }],
		});
		const incompletePreview = await service.previewDataImport(incomplete);
		expect(incompletePreview.plan.ready).toBe(false);
		expect(incompletePreview.plan.unresolvedNewsIndexes).toEqual([0]);

		const collision = makeRequest(source, {
			newsDecisions: [
				{ newsIndex: 0, action: "rename", mode: "manual", targetSlug: "used-by-another" },
			],
		});
		const collisionPreview = await service.previewDataImport(collision);
		expect(collisionPreview.plan.ready).toBe(false);
		expect(collisionPreview.plan.errors).toContain(
			"変更後slug「used-by-another」は取り込み先または他のお知らせと重複しています。",
		);

		const manual = makeRequest(source, {
			newsDecisions: [
				{ newsIndex: 0, action: "rename", mode: "manual", targetSlug: "welcome-imported" },
			],
		});
		const manualPreview = await service.previewDataImport(manual);
		expect(manualPreview.plan.ready).toBe(true);
		expect(manualPreview.plan.news[0]?.targetSlug).toBe("welcome-imported");
	});

	it("commits mixed per-article skip, manual, and auto decisions without consuming a reserved manual slug", async () => {
		const { service, sqlite } = await createImportContext();
		const existingAlpha = await service.createNews({
			slug: "alpha",
			lang: "ja",
			title: "Keep alpha",
			contentType: "markdown",
			content: "Existing alpha content",
		});
		const existingManual = await service.createNews({
			slug: "manual-entry",
			lang: "ja",
			title: "Keep manual entry",
			contentType: "markdown",
			content: "Existing manual content",
		});
		const existingSkipped = await service.createNews({
			slug: "skip-entry",
			lang: "ja",
			title: "Keep skipped entry",
			contentType: "markdown",
			content: "Existing skipped content",
		});
		const request = makeRequest(
			makeSource([
				article("alpha", [makeTranslation("ja", "Imported alpha")]),
				article("manual-entry", [makeTranslation("ja", "Imported manual")]),
				article("skip-entry", [makeTranslation("ja", "Ignored duplicate")]),
			]),
			{
				newsDecisions: [
					{ newsIndex: 0, action: "rename", mode: "auto" },
					{ newsIndex: 1, action: "rename", mode: "manual", targetSlug: "alpha-2" },
					{ newsIndex: 2, action: "skip" },
				],
			},
		);

		const preview = await service.previewDataImport(request);
		expect(preview.plan.ready).toBe(true);
		expect(preview.plan.news.map((item) => [item.action, item.targetSlug])).toEqual([
			["create", "alpha-3"],
			["create", "alpha-2"],
			["skip", null],
		]);
		const result = await service.importData({
			...request,
			expectedPreviewToken: preview.previewToken,
		});

		expect(result.newsSlugs).toEqual([
			{ sourceSlug: "alpha", targetSlug: "alpha-3" },
			{ sourceSlug: "manual-entry", targetSlug: "alpha-2" },
		]);
		for (const existing of [existingAlpha, existingManual, existingSkipped]) {
			const persisted = sqlite
				.prepare("SELECT id, slug, deleted_at AS deletedAt FROM news WHERE id = ?")
				.get(existing.id) as { id: string; slug: string; deletedAt: string | null };
			expect(persisted).toEqual({ id: existing.id, slug: existing.slug, deletedAt: null });
		}
		expect(rowCount(sqlite, "news")).toBe(5);
	});

	it("returns detailed target rows and invalidates approval when a target article tag changes", async () => {
		const { service, sqlite } = await createImportContext();
		const targetTag = await service.createTag({ name: "Current tag", slug: "current-tag" });
		const existing = await service.createNews({
			slug: "current-item",
			lang: "ja",
			title: "Current title",
			summary: "Current summary",
			contentType: "markdown",
			content: "# Current body",
			tagIds: [targetTag.id],
		});
		const request = makeRequest(makeSource([article("new-item")]));
		const preview = await service.previewDataImport(request);
		const targetNews = preview.targetCurrent.news.find((item) => item.id === existing.id);

		expect(targetNews).toMatchObject({
			id: existing.id,
			slug: "current-item",
			tags: [{ id: targetTag.id, name: "Current tag", slug: "current-tag" }],
			translations: [
				{
					id: expect.any(String),
					lang: "ja",
					title: "Current title",
					summary: "Current summary",
					content: "# Current body",
					contentType: "markdown",
					status: "draft",
				},
			],
		});

		sqlite.prepare("DELETE FROM news_tags WHERE news_id = ?").run(existing.id);
		await expect(
			service.importData({ ...request, expectedPreviewToken: preview.previewToken }),
		).rejects.toMatchObject({ code: "conflict" });
		expect(rowCount(sqlite, "news")).toBe(1);
	});

	it("includes target scope IDs and per-article tag relationships in a usable target snapshot", async () => {
		const { service } = await createImportContext();
		const targetTag = await service.createTag({ name: "Snapshot tag", slug: "snapshot-tag" });
		const existing = await service.createNews({
			slug: "snapshot-item",
			lang: "ja",
			title: "Snapshot title",
			contentType: "link",
			content: "https://example.com/current",
			tagIds: [targetTag.id],
		});
		const preview = await service.previewDataImport(makeRequest(makeSource([])));
		const snapshotNews = preview.targetCurrent.news.find((item) => item.id === existing.id);

		expect(preview.targetCurrent.scope.id).toEqual(expect.any(String));
		expect(snapshotNews).toMatchObject({
			id: existing.id,
			tags: [{ id: targetTag.id, name: "Snapshot tag", slug: "snapshot-tag" }],
			translations: [
				{
					id: expect.any(String),
					lang: "ja",
					title: "Snapshot title",
					summary: null,
					contentType: "link",
					content: "https://example.com/current",
					status: "draft",
				},
			],
		});
	});

	it("adds or maps missing canonical languages, while keeping target identity and rejecting per-article mapping collisions", async () => {
		const { repository, service, sqlite } = await createImportContext();
		const source = makeSource(
			[
				article("bonjour", [
					makeTranslation("FR-ca", "French translation"),
					makeTranslation("de", "German translation"),
				]),
			],
			[],
			{ year: 2050, site: "different", name: "Source scope identity", defaultLanguage: "fr-ca" },
		);
		const decisionsRequest = makeRequest(source, {
			languageDecisions: [
				{ sourceLanguage: "fr-ca", action: "add" },
				{ sourceLanguage: "de", action: "map", targetLanguage: "EN" },
			],
		});
		const preview = await service.previewDataImport(decisionsRequest);
		expect(preview.plan.ready).toBe(true);
		expect(preview.plan.languagesToAdd).toEqual(["fr-CA"]);
		expect(preview.plan.languageMappings).toEqual([{ sourceLanguage: "de", targetLanguage: "en" }]);
		expect(rowCount(sqlite, "news")).toBe(0);

		const result = await service.importData({
			...decisionsRequest,
			expectedPreviewToken: preview.previewToken,
		});
		const target = await repository.findScope({ year: 2026, site: "festival" });
		expect(result.addedLanguages).toEqual(["fr-CA"]);
		expect(target).toMatchObject({
			name: "Festival target",
			defaultLanguage: "ja",
			availableLanguages: ["ja", "en", "fr-CA"],
		});
		expect(rowCount(sqlite, "news_translations", "lang = ?", "fr-CA")).toBe(1);
		expect(rowCount(sqlite, "news_translations", "lang = ?", "en")).toBe(1);

		const collisionSource = makeSource([
			article("mapped-collision", [
				makeTranslation("fr", "French translation"),
				makeTranslation("de", "German translation"),
			]),
		]);
		const collisionRequest = makeRequest(collisionSource, {
			languageDecisions: [
				{ sourceLanguage: "fr", action: "map", targetLanguage: "ja" },
				{ sourceLanguage: "de", action: "map", targetLanguage: "JA" },
			],
		});
		const collisionPreview = await service.previewDataImport(collisionRequest);
		expect(collisionPreview.plan.ready).toBe(false);
		expect(collisionPreview.plan.errors).toContain(
			"お知らせ「mapped-collision」の複数の翻訳が同じ取り込み先言語「ja」になります。",
		);
	});

	it("does not require a language used only by a skipped duplicate", async () => {
		const { service } = await createImportContext();
		await service.createNews({
			slug: "already-here",
			lang: "ja",
			title: "Existing",
			contentType: "markdown",
			content: "Keep",
		});
		const request = makeRequest(
			makeSource([article("already-here", [makeTranslation("fr", "Skip this")])]),
			{ newsDecisions: [{ newsIndex: 0, action: "skip" }] },
		);
		const preview = await service.previewDataImport(request);
		expect(preview.plan.ready).toBe(true);
		expect(preview.plan.unresolvedLanguages).toEqual([]);
		expect(preview.plan.languagesToAdd).toEqual([]);
	});

	it("rejects canonical duplicate slugs/languages, duplicate or unknown tag references, and invalid input before writes", async () => {
		const { service, sqlite } = await createImportContext();
		const duplicateSlug = makeRequest(
			makeSource([
				article("Upper", [makeTranslation("ja", "One")]),
				article("upper", [makeTranslation("ja", "Two")]),
			]),
		);
		const duplicateSlugPreview = await service.previewDataImport(duplicateSlug);
		expect(duplicateSlugPreview.plan.ready).toBe(false);
		expect(duplicateSlugPreview.plan.errors).toContain(
			"元データに同じslugのお知らせ「upper」が複数あります。",
		);

		const duplicateLanguage = makeRequest(
			makeSource([
				article("same-language", [
					makeTranslation("EN-us", "First"),
					makeTranslation("en-US", "Second"),
				]),
			]),
		);
		const duplicateLanguagePreview = await service.previewDataImport(duplicateLanguage);
		expect(duplicateLanguagePreview.plan.errors).toContain(
			"お知らせ「same-language」に同じ言語の翻訳が複数あります。",
		);

		const invalidTagReferences = makeRequest(
			makeSource(
				[article("bad-ref", [makeTranslation("ja", "Invalid")], ["Missing", "Missing"])],
				[{ name: "Tag", slug: "tag" }],
			),
		);
		const invalidTagPreview = await service.previewDataImport(invalidTagReferences);
		expect(invalidTagPreview.plan.ready).toBe(false);
		expect(invalidTagPreview.plan.errors).toContain(
			"お知らせ「bad-ref」が元データにないタグを参照しています。",
		);

		const duplicateTagNames = makeRequest(
			makeSource(
				[],
				[
					{ name: " Tag ", slug: "tag-one" },
					{ name: "Tag", slug: "tag-two" },
				],
			),
		);
		const duplicateTagPreview = await service.previewDataImport(duplicateTagNames);
		expect(duplicateTagPreview.plan.ready).toBe(false);
		expect(duplicateTagPreview.plan.errors).toContain(
			"元データに同じ名前のタグ「Tag」が複数あります。",
		);

		const invalidTitle = makeRequest(
			makeSource([article("bad-title", [makeTranslation("ja", "x".repeat(201))])]),
		);
		const invalidTitlePreview = await service.previewDataImport(invalidTitle);
		expect(invalidTitlePreview.plan.ready).toBe(false);
		expect(invalidTitlePreview.plan.errors).toContain(
			"お知らせ「bad-title」の翻訳内容に不正な値があります。",
		);
		await expect(
			service.importData({
				...invalidTitle,
				expectedPreviewToken: invalidTitlePreview.previewToken,
			}),
		).rejects.toMatchObject({ code: "validation" });
		expect(rowCount(sqlite, "news")).toBe(0);
		expect(rowCount(sqlite, "tags")).toBe(0);
		expect(rowCount(sqlite, "audit_logs", "action = ?", "data.import")).toBe(0);
	});

	it("requires a fresh preview after target state changes and never overwrites a concurrent language edit", async () => {
		const { database, repository, service, sqlite } = await createImportContext();
		const request = makeRequest(makeSource([article("new-item", [makeTranslation("ja", "New")])]));
		const preview = await service.previewDataImport(request);
		const target = await repository.findScope({ year: 2026, site: "festival" });
		if (!target) throw new Error("Target scope disappeared.");
		await database
			.update(scopes)
			.set({ availableLanguages: ["ja", "en", "fr"], updatedAt: new Date() })
			.where(eq(scopes.id, target.id));

		await expect(
			service.importData({ ...request, expectedPreviewToken: preview.previewToken }),
		).rejects.toMatchObject({ code: "conflict" });
		expect(rowCount(sqlite, "news")).toBe(0);
		const latest = await repository.findScope({ year: 2026, site: "festival" });
		expect(latest?.availableLanguages).toEqual(["ja", "en", "fr"]);
	});

	it("rolls back languages, tags, news, translations, links, and audit when a late statement fails", async () => {
		const { service, sqlite, repository } = await createImportContext();
		const request = makeRequest(
			makeSource(
				[article("rollback-item", [makeTranslation("fr", "Nouveau")], ["new-tag"])],
				[{ name: "New tag", slug: "new-tag" }],
				{ availableLanguages: ["fr"], defaultLanguage: "fr" },
			),
			{ languageDecisions: [{ sourceLanguage: "fr", action: "add" }] },
		);
		const preview = await service.previewDataImport(request);
		sqlite.exec(`
			CREATE TRIGGER fail_import_translation
			BEFORE INSERT ON news_translations
			WHEN NEW.lang = 'fr'
			BEGIN
				SELECT RAISE(ABORT, 'forced late import failure');
			END;
		`);

		await expect(
			service.importData({ ...request, expectedPreviewToken: preview.previewToken }),
		).rejects.toThrow("forced late import failure");
		expect(rowCount(sqlite, "news")).toBe(0);
		expect(rowCount(sqlite, "news_translations")).toBe(0);
		expect(rowCount(sqlite, "news_tags")).toBe(0);
		expect(rowCount(sqlite, "tags")).toBe(0);
		expect(rowCount(sqlite, "audit_logs", "action = ?", "data.import")).toBe(0);
		const target = await repository.findScope({ year: 2026, site: "festival" });
		expect(target?.availableLanguages).toEqual(["ja", "en"]);
	});

	it("rolls back all rows when a late slug uniqueness race occurs", async () => {
		const { service, sqlite, repository } = await createImportContext();
		const request = makeRequest(
			makeSource(
				[article("raced-item", [makeTranslation("fr", "Bonjour")])],
				[{ name: "Race tag", slug: "race-tag" }],
				{ availableLanguages: ["fr"], defaultLanguage: "fr" },
			),
			{ languageDecisions: [{ sourceLanguage: "fr", action: "add" }] },
		);
		const preview = await service.previewDataImport(request);
		sqlite.exec(`
			CREATE TRIGGER create_late_import_slug
			BEFORE INSERT ON news
			WHEN NEW.slug = 'raced-item'
			BEGIN
				INSERT INTO news (id, scope_id, slug, created_at, updated_at, created_by, updated_by)
				VALUES ('race-winner', NEW.scope_id, NEW.slug, 1, 1, 'race', 'race');
			END;
		`);

		await expect(
			service.importData({ ...request, expectedPreviewToken: preview.previewToken }),
		).rejects.toMatchObject({ code: "conflict" });
		expect(rowCount(sqlite, "news")).toBe(0);
		expect(rowCount(sqlite, "tags")).toBe(0);
		expect(rowCount(sqlite, "audit_logs", "action = ?", "data.import")).toBe(0);
		const target = await repository.findScope({ year: 2026, site: "festival" });
		expect(target?.availableLanguages).toEqual(["ja", "en"]);
	});
});
