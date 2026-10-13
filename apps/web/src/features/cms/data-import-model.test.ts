import { describe, expect, it } from "vitest";

import {
	applyDataImportLanguageAction,
	applyDataImportLanguageTarget,
	applyDataImportNewsAction,
	buildDataImportRequest,
	createDataImportDraft,
	getDataImportErrorMessage,
	getDataImportRequestFingerprint,
	getDataImportSource,
	getDataImportSourceOptionLabel,
	getDataImportSourceOptionValue,
	getDataImportSourceSummary,
	parseDataImportText,
	reconcileDataImportLanguageChoices,
	updateDataImportLanguageChoice,
	updateDataImportManualSlug,
	updateDataImportNewsChoice,
} from "./data-import-model";

const markdownTranslation = {
	lang: "ja",
	title: "お知らせ",
	summary: null,
	contentType: "markdown",
	content: "# お知らせ",
	status: "draft",
	publishedAt: null,
} as const;

const linkTranslation = {
	lang: "en",
	title: "Notice",
	summary: "Read the announcement",
	contentType: "link",
	content: "https://example.com/news",
	status: "published",
	publishedAt: "2026-10-05T03:00:00.000Z",
} as const;

const firstSource = {
	version: 1,
	exportedAt: "2026-10-05T03:00:00.000Z",
	scope: {
		year: 2026,
		site: "festival",
		name: "Festival",
		availableLanguages: ["ja", "en"],
		defaultLanguage: "ja",
	},
	tags: [{ name: "Important", slug: "important" }],
	news: [
		{ slug: "welcome", tags: ["important"], translations: [markdownTranslation, linkTranslation] },
		{ slug: "welcome-copy", tags: [], translations: [markdownTranslation] },
	],
};

const secondSource = {
	...firstSource,
	news: [{ slug: "different", tags: [], translations: [markdownTranslation] }],
};

function parseOriginal(entries: unknown[]) {
	const parsed = parseDataImportText(JSON.stringify(entries));
	if (!parsed.success) throw new Error("Valid source data did not parse.");
	return parsed.original;
}

describe("data import editing model", () => {
	it("retains the uploaded text and freezes the parsed multi-scope baseline", () => {
		const rawText = JSON.stringify([firstSource, secondSource], null, 2);
		const parsed = parseDataImportText(rawText);

		expect(parsed.success).toBe(true);
		if (!parsed.success) return;

		expect(parsed.original.rawText).toBe(rawText);
		expect(parsed.original.entries).toHaveLength(2);
		expect(Object.isFrozen(parsed.original)).toBe(true);
		expect(Object.isFrozen(parsed.original.entries[0])).toBe(true);
		expect(Object.isFrozen(parsed.original.entries[0]!.news[0]!.translations[0])).toBe(true);
	});

	it("selects one entry by index and distinguishes identical scope labels", () => {
		const original = parseOriginal([firstSource, firstSource]);

		expect(getDataImportSourceOptionValue(0)).toBe("0");
		expect(getDataImportSourceOptionValue(1)).toBe("1");
		expect(getDataImportSourceOptionLabel(original.entries[1]!, 1)).toBe(
			"元データ 2: Festival（2026 · festival）",
		);
		expect(getDataImportSource(original, "")).toBeUndefined();
		expect(getDataImportSource(original, "01")).toBeUndefined();
		expect(getDataImportSource(original, "1")).toBe(original.entries[1]);
		expect(getDataImportSource(original, "2")).toBeUndefined();
	});

	it("edits an independent draft and retains an incomplete manual slug for local diagnosis", () => {
		const original = parseOriginal([firstSource]);
		const source = getDataImportSource(original, "0");
		if (!source) throw new Error("Expected source entry.");
		let draft = createDataImportDraft(source, 0, 7);
		draft = updateDataImportNewsChoice(draft, 0, {
			newsIndex: 0,
			action: "rename",
			mode: "manual",
			targetSlug: "",
		});
		draft = updateDataImportManualSlug(draft, 0, "welcome-copy");

		expect(draft.source).not.toBe(original.entries[0]);
		expect(draft.source.news[0]).not.toBe(original.entries[0]!.news[0]);
		expect(draft.newsChoices).toEqual([
			{ newsIndex: 0, action: "rename", mode: "manual", targetSlug: "welcome-copy" },
		]);
		expect(original.entries[0]!.news[0]!.slug).toBe("welcome");
		expect(original.entries[0]!.news[0]!.translations[1]!.content).toBe("https://example.com/news");
		expect(Object.isFrozen(original.entries[0]!.news[0])).toBe(true);
	});

	it("applies per-article mode changes without retaining stale manual values", () => {
		const original = parseOriginal([firstSource]);
		const source = getDataImportSource(original, "0");
		if (!source) throw new Error("Expected source entry.");
		let draft = createDataImportDraft(source, 0, 8);
		draft = applyDataImportNewsAction(draft, 0, "manual", ["ja", "en"]);
		draft = updateDataImportManualSlug(draft, 0, "custom-slug");
		draft = applyDataImportNewsAction(draft, 0, "auto", ["ja", "en"]);
		expect(buildDataImportRequest(draft).newsDecisions).toEqual([
			{ newsIndex: 0, action: "rename", mode: "auto" },
		]);

		draft = applyDataImportNewsAction(draft, 0, "manual", ["ja", "en"]);
		expect(buildDataImportRequest(draft).newsDecisions).toEqual([
			{ newsIndex: 0, action: "rename", mode: "manual", targetSlug: "" },
		]);
		draft = applyDataImportNewsAction(draft, 0, null, ["ja", "en"]);
		expect(buildDataImportRequest(draft).newsDecisions).toEqual([]);
		expect(original.entries[0]!.news[0]!.slug).toBe("welcome");
	});

	it("prunes a missing-language choice when its last article is skipped", () => {
		const source = {
			...firstSource,
			news: [
				{ slug: "french", tags: [], translations: [{ ...markdownTranslation, lang: "fr" }] },
				{ slug: "german", tags: [], translations: [{ ...markdownTranslation, lang: "de" }] },
			],
		};
		const original = parseOriginal([source]);
		const selectedSource = getDataImportSource(original, "0");
		if (!selectedSource) throw new Error("Expected source entry.");
		let draft = createDataImportDraft(selectedSource, 0, 9);
		draft = applyDataImportLanguageAction(draft, "fr", "map");
		draft = applyDataImportLanguageTarget(draft, "fr", "en");
		draft = applyDataImportLanguageAction(draft, "de", "add");
		draft = applyDataImportNewsAction(draft, 0, "skip", ["ja", "en"]);

		expect(draft.languageChoices).toEqual([
			{ sourceLanguage: "de", action: "add", targetLanguage: null },
		]);
		expect(buildDataImportRequest(draft).languageDecisions).toEqual([
			{ sourceLanguage: "de", action: "add" },
		]);
		expect(original.entries[0]!.news[0]!.slug).toBe("french");
	});

	it("builds per-article requests without dropping raw manual values or incomplete language choices", () => {
		const original = parseOriginal([firstSource]);
		const source = getDataImportSource(original, "0");
		if (!source) throw new Error("Expected source entry.");
		let draft = createDataImportDraft(source, 0, 1);
		draft = updateDataImportNewsChoice(draft, 0, {
			newsIndex: 0,
			action: "rename",
			mode: "manual",
			targetSlug: "  welcome-copy  ",
		});
		draft = updateDataImportNewsChoice(draft, 1, { newsIndex: 1, action: "skip" });
		draft = updateDataImportLanguageChoice(
			draft,
			{ sourceLanguage: "fr", action: "map", targetLanguage: "" },
			"fr",
		);
		draft = updateDataImportLanguageChoice(
			draft,
			{ sourceLanguage: "en", action: "map", targetLanguage: "ja" },
			"en",
		);

		const request = buildDataImportRequest(draft);
		expect(request.source).toEqual(firstSource);
		expect(request.source).not.toBe(draft.source);
		expect(request.newsDecisions).toEqual([
			{ newsIndex: 0, action: "rename", mode: "manual", targetSlug: "  welcome-copy  " },
			{ newsIndex: 1, action: "skip" },
		]);
		expect(request.languageDecisions).toEqual([
			{ sourceLanguage: "en", action: "map", targetLanguage: "ja" },
		]);
		expect(getDataImportRequestFingerprint(request)).not.toBe(
			getDataImportRequestFingerprint({ ...request, newsDecisions: [] }),
		);
		expect(draft.languageChoices).toContainEqual({
			sourceLanguage: "fr",
			action: "map",
			targetLanguage: "",
		});
		expect(original.entries[0]!.news[0]!.slug).toBe("welcome");
	});

	it("reconciles language decisions when skipped articles or target languages change", () => {
		const source = {
			...firstSource,
			news: [
				{ slug: "first", tags: [], translations: [{ ...markdownTranslation, lang: "fr" }] },
				{ slug: "second", tags: [], translations: [{ ...markdownTranslation, lang: "fr" }] },
			],
		};
		const original = parseOriginal([source]);
		const selectedSource = getDataImportSource(original, "0");
		if (!selectedSource) throw new Error("Expected source entry.");
		let draft = createDataImportDraft(selectedSource, 0, 2);
		draft = updateDataImportLanguageChoice(
			draft,
			{ sourceLanguage: "fr", action: "map", targetLanguage: "en" },
			"fr",
		);
		draft = updateDataImportNewsChoice(draft, 0, { newsIndex: 0, action: "skip" });

		const choiceStillNeeded = reconcileDataImportLanguageChoices(draft, ["ja", "en"]);
		expect(choiceStillNeeded.languageChoices).toEqual([
			{ sourceLanguage: "fr", action: "map", targetLanguage: "en" },
		]);

		const invalidatedTarget = reconcileDataImportLanguageChoices(choiceStillNeeded, ["ja"]);
		expect(invalidatedTarget.languageChoices).toEqual([
			{ sourceLanguage: "fr", action: "map", targetLanguage: "" },
		]);

		const allSkipped = updateDataImportNewsChoice(choiceStillNeeded, 1, {
			newsIndex: 1,
			action: "skip",
		});
		expect(reconcileDataImportLanguageChoices(allSkipped, ["ja", "en"]).languageChoices).toEqual(
			[],
		);
	});

	it("summarizes source counts and distinguishes malformed, empty, unsupported, and invalid files", () => {
		const original = parseOriginal([firstSource]);
		expect(getDataImportSourceSummary(original.entries[0]!)).toEqual({
			articleCount: 2,
			tagCount: 1,
			translationCount: 3,
		});

		expect(parseDataImportText("{")).toEqual({ success: false, error: "invalid-json" });
		expect(parseDataImportText("[]")).toEqual({ success: false, error: "empty" });
		expect(parseDataImportText(JSON.stringify([{ ...firstSource, version: 2 }]))).toMatchObject({
			success: false,
			error: "unsupported-version",
		});
		expect(
			parseDataImportText(
				JSON.stringify([
					{
						...firstSource,
						news: [
							{
								...firstSource.news[0],
								translations: [{ ...markdownTranslation, contentType: "video" }],
							},
						],
					},
				]),
			),
		).toMatchObject({ success: false, error: "invalid-data" });
		expect(getDataImportErrorMessage("unsupported-version")).toContain("version 1");
	});
});
