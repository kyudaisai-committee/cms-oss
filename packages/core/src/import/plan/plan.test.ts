import { describe, expect, it } from "vitest";

import type { DataImportRequest, ScopeDataExport } from "#core/types";

import { planDataImport } from "./index";
import type { ImportPlanTarget } from "./types";

function translation(
	lang: string,
	title = `${lang} title`,
	options: { status?: "draft" | "published"; contentType?: "markdown" | "link" } = {},
) {
	const contentType = options.contentType ?? "markdown";
	return {
		lang,
		title,
		summary: null,
		contentType,
		content: contentType === "link" ? "https://example.com/article" : `# ${title}`,
		status: options.status ?? "draft",
		publishedAt: options.status === "published" ? "2026-10-01T00:00:00.000Z" : null,
	};
}

function sourceNews(slug: string, langs = ["ja"], tags: string[] = []) {
	return {
		slug,
		tags,
		translations: langs.map((lang) => translation(lang)),
	};
}

function sourceData(
	news: ScopeDataExport["news"],
	tags: ScopeDataExport["tags"] = [],
): ScopeDataExport {
	return {
		version: 1,
		exportedAt: "2026-10-05T03:00:00.000Z",
		scope: {
			year: 2040,
			site: "committee",
			name: "Source site",
			availableLanguages: ["ja", "en"],
			defaultLanguage: "en",
		},
		tags,
		news,
	};
}

function request(
	source: ScopeDataExport,
	options: Partial<Pick<DataImportRequest, "newsDecisions" | "languageDecisions">> = {},
): DataImportRequest {
	return {
		source,
		newsDecisions: options.newsDecisions ?? [],
		languageDecisions: options.languageDecisions ?? [],
	};
}

function target(overrides: Partial<ImportPlanTarget> = {}): ImportPlanTarget {
	return {
		scope: {
			id: "target-scope",
			year: 2026,
			site: "festival",
			name: "Target site",
			availableLanguages: ["ja", "en"],
			defaultLanguage: "ja",
		},
		news: [],
		tags: [],
		...overrides,
	};
}

function deepFreeze<T>(value: T): T {
	if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
	Object.freeze(value);
	for (const child of Object.values(value)) deepFreeze(child);
	return value;
}

describe("pure data import planner", () => {
	it("keeps the immutable source baseline and target snapshot unchanged", () => {
		const source = sourceData(
			[sourceNews("welcome", ["ja", "en"], ["source-tag"])],
			[{ name: "Source tag", slug: "source-tag" }],
		);
		const input = request(source, {
			newsDecisions: [
				{ newsIndex: 0, action: "rename", mode: "manual", targetSlug: "welcome-new" },
			],
			languageDecisions: [{ sourceLanguage: "fr", action: "add" }],
		});
		const targetSnapshot = target({
			news: [
				{
					id: "existing-news",
					slug: "welcome",
					tags: [],
					translations: [
						{
							id: "translation-existing",
							summary: null,
							content: "Current content",
							lang: "ja",
							title: "Current title",
							contentType: "markdown",
							status: "published",
							publishedAt: "2026-09-01T00:00:00.000Z",
						},
					],
				},
			],
			tags: [{ id: "target-tag", name: "Current tag", slug: "source-tag" }],
		});
		const sourceBefore = JSON.stringify(input);
		const targetBefore = JSON.stringify(targetSnapshot);
		const frozenInput = deepFreeze(input);
		const frozenTarget = deepFreeze(targetSnapshot);

		const planned = planDataImport(frozenInput, frozenTarget);

		expect(JSON.stringify(input)).toBe(sourceBefore);
		expect(JSON.stringify(targetSnapshot)).toBe(targetBefore);
		expect(planned.plan.news[0]?.targetSlug).toBe("welcome-new");
		expect(planned.preparedNews[0]?.translations.map(({ lang }) => lang)).toEqual(["ja", "en"]);
		expect(planned.targetCurrent.scope).toMatchObject({
			year: 2026,
			site: "festival",
			name: "Target site",
			availableLanguages: ["ja", "en"],
			defaultLanguage: "ja",
		});
	});

	it("reserves existing and incoming slugs before auto-renaming and preserves the 200-character limit", () => {
		const existingSuffixNews = ["article", "article-3"].map((slug, index) => ({
			id: `existing-${index}`,
			slug,
			tags: [],
			translations: [],
		}));
		const longSlug = "a".repeat(200);
		const planned = planDataImport(
			request(sourceData([sourceNews("article"), sourceNews("article-2"), sourceNews(longSlug)]), {
				newsDecisions: [
					{ newsIndex: 0, action: "rename", mode: "auto" },
					{ newsIndex: 2, action: "rename", mode: "auto" },
				],
			}),
			target({
				news: [
					...existingSuffixNews,
					{ id: "existing-long", slug: longSlug, tags: [], translations: [] },
				],
			}),
		);

		expect(planned.plan.ready).toBe(true);
		expect(planned.plan.news.map((item) => item.targetSlug)).toEqual([
			"article-4",
			"article-2",
			`${"a".repeat(198)}-2`,
		]);
		expect(planned.plan.news[2]?.targetSlug?.length).toBe(200);
	});

	it("rejects collisions across manual renames and canonical duplicate source slugs", () => {
		const manual = planDataImport(
			request(sourceData([sourceNews("first"), sourceNews("second")]), {
				newsDecisions: [
					{ newsIndex: 0, action: "rename", mode: "manual", targetSlug: "shared-custom" },
					{ newsIndex: 1, action: "rename", mode: "manual", targetSlug: "shared-custom" },
				],
			}),
			target({
				news: [
					{ id: "target-first", slug: "first", tags: [], translations: [] },
					{ id: "target-second", slug: "second", tags: [], translations: [] },
				],
			}),
		);
		const duplicate = planDataImport(
			request(sourceData([sourceNews("Welcome"), sourceNews("welcome")])),
			target(),
		);

		expect(manual.plan.ready).toBe(false);
		expect(manual.plan.errors).toContain(
			"変更後slug「shared-custom」は取り込み先または他のお知らせと重複しています。",
		);
		expect(duplicate.plan.errors).toContain(
			"元データに同じslugのお知らせ「welcome」が複数あります。",
		);
	});

	it("requires an explicit choice for every collision and allows mixed per-article outcomes", () => {
		const source = sourceData([
			sourceNews("skip-me"),
			sourceNews("manual-me"),
			sourceNews("auto-me"),
			sourceNews("unresolved"),
		]);
		const planned = planDataImport(
			request(source, {
				newsDecisions: [
					{ newsIndex: 0, action: "skip" },
					{ newsIndex: 1, action: "rename", mode: "manual", targetSlug: "manual-copy" },
					{ newsIndex: 2, action: "rename", mode: "auto" },
				],
			}),
			target({
				news: [
					{ id: "skip", slug: "skip-me", tags: [], translations: [] },
					{ id: "manual", slug: "manual-me", tags: [], translations: [] },
					{ id: "auto", slug: "auto-me", tags: [], translations: [] },
					{ id: "unresolved", slug: "unresolved", tags: [], translations: [] },
				],
			}),
		);

		expect(planned.plan.news.map((item) => [item.action, item.targetSlug])).toEqual([
			["skip", null],
			["create", "manual-copy"],
			["create", "auto-me-2"],
			["unresolved", null],
		]);
		expect(planned.plan.news.map((item) => item.duplicateDecision)).toEqual([
			"skip",
			"rename-manual",
			"rename-auto",
			null,
		]);
		expect(planned.plan.unresolvedNewsIndexes).toEqual([3]);
		expect(planned.plan.ready).toBe(false);
	});

	it("reserves manual rename targets before assigning earlier auto-renames", () => {
		const planned = planDataImport(
			request(sourceData([sourceNews("article"), sourceNews("manual-article")]), {
				newsDecisions: [
					{ newsIndex: 0, action: "rename", mode: "auto" },
					{ newsIndex: 1, action: "rename", mode: "manual", targetSlug: "article-2" },
				],
			}),
			target({
				news: [
					{ id: "existing-article", slug: "article", tags: [], translations: [] },
					{ id: "existing-manual", slug: "manual-article", tags: [], translations: [] },
				],
			}),
		);

		expect(planned.plan.ready).toBe(true);
		expect(planned.plan.news.map((item) => item.targetSlug)).toEqual(["article-3", "article-2"]);
	});

	it("adds canonical missing languages, maps others, and rejects mapping collisions per article", () => {
		const source = sourceData([sourceNews("first", ["FR-ca", "de"]), sourceNews("second", ["it"])]);
		const planned = planDataImport(
			request(source, {
				languageDecisions: [
					{ sourceLanguage: "fr-ca", action: "add" },
					{ sourceLanguage: "de", action: "map", targetLanguage: "EN" },
					{ sourceLanguage: "it", action: "map", targetLanguage: "en" },
				],
			}),
			target(),
		);
		const collision = planDataImport(
			request(sourceData([sourceNews("collision", ["fr", "de"])]), {
				languageDecisions: [
					{ sourceLanguage: "fr", action: "map", targetLanguage: "ja" },
					{ sourceLanguage: "de", action: "map", targetLanguage: "JA" },
				],
			}),
			target(),
		);

		expect(planned.plan.ready).toBe(true);
		expect(planned.plan.languagesToAdd).toEqual(["fr-CA"]);
		expect(planned.plan.languageMappings).toEqual([
			{ sourceLanguage: "de", targetLanguage: "en" },
			{ sourceLanguage: "it", targetLanguage: "en" },
		]);
		expect(planned.availableLanguages).toEqual(["ja", "en", "fr-CA"]);
		expect(planned.targetCurrent.scope.defaultLanguage).toBe("ja");
		expect(collision.plan.ready).toBe(false);
		expect(collision.plan.errors).toContain(
			"お知らせ「collision」の複数の翻訳が同じ取り込み先言語「ja」になります。",
		);
	});

	it("does not add languages only used by skipped news and reuses tags by slug before name", () => {
		const planned = planDataImport(
			request(
				sourceData(
					[
						sourceNews("already-there", ["fr"]),
						sourceNews("new-entry", ["ja"], ["priority", "legacy-name"]),
					],
					[
						{ name: "Renamed source tag", slug: "priority" },
						{ name: "Reusable name", slug: "legacy-name" },
						{ name: "Unused tag", slug: "unused" },
					],
				),
				{ newsDecisions: [{ newsIndex: 0, action: "skip" }] },
			),
			target({
				news: [{ id: "existing", slug: "already-there", tags: [], translations: [] }],
				tags: [
					{ id: "tag-by-slug", name: "Current priority", slug: "priority" },
					{ id: "tag-by-name", name: "Reusable name", slug: "target-name" },
				],
			}),
		);

		expect(planned.plan.ready).toBe(true);
		expect(planned.plan.unresolvedLanguages).toEqual([]);
		expect(planned.plan.languagesToAdd).toEqual([]);
		expect(planned.preparedTags).toMatchObject([
			{
				sourceSlug: "priority",
				action: "reuse",
				targetTagId: "tag-by-slug",
				targetName: "Current priority",
			},
			{
				sourceSlug: "legacy-name",
				action: "reuse",
				targetTagId: "tag-by-name",
				targetName: "Reusable name",
			},
			{ sourceSlug: "unused", action: "create", targetTagId: null },
		]);
		expect(planned.preparedNews[1]?.tagSlugs).toEqual(["priority", "legacy-name"]);
	});

	it("rejects mapped language duplicates, unknown tag references, duplicate tags, and invalid translation titles", () => {
		const invalid = planDataImport(
			request(
				sourceData(
					[
						{
							slug: "invalid-entry",
							tags: ["missing"],
							translations: [translation("ja", "x".repeat(201))],
						},
					],
					[
						{ name: " Tag ", slug: "tag-one" },
						{ name: "Tag", slug: "tag-two" },
					],
				),
			),
			target(),
		);

		expect(invalid.plan.ready).toBe(false);
		expect(invalid.plan.errors).toContain(
			"お知らせ「invalid-entry」が元データにないタグを参照しています。",
		);
		expect(invalid.plan.errors).toContain("元データに同じ名前のタグ「Tag」が複数あります。");
		expect(invalid.plan.errors).toContain(
			"お知らせ「invalid-entry」の翻訳内容に不正な値があります。",
		);
	});
});
