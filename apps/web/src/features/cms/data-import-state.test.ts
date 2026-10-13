import { describe, expect, it } from "vitest";

import {
	buildDataImportRequest,
	createDataImportDraft,
	getDataImportRequestFingerprint,
	getDataImportSource,
	isDataImportCommitReady,
	parseDataImportText,
	updateDataImportNewsChoice,
} from "./data-import-model";
import { planDataImportDraft } from "./data-import/plan";
import { snapshotDataImportTarget } from "./data-import/source";

const sourceData = {
	version: 1,
	exportedAt: "2026-10-05T03:00:00.000Z",
	scope: {
		year: 2027,
		site: "source",
		name: "Source",
		availableLanguages: ["ja"],
		defaultLanguage: "ja",
	},
	tags: [{ name: "Source tag", slug: "source-tag" }],
	news: [
		{
			slug: "welcome",
			tags: ["source-tag"],
			translations: [
				{
					lang: "ja",
					title: "Source title",
					summary: null,
					contentType: "markdown",
					content: "# Original content",
					status: "draft",
					publishedAt: null,
				},
			],
		},
	],
};

const targetData = {
	scope: {
		id: "target-id",
		year: 2026,
		site: "target",
		name: "Target",
		availableLanguages: ["ja"],
		defaultLanguage: "ja",
	},
	news: [
		{
			id: "existing-news-id",
			slug: "welcome",
			tags: [{ id: "target-tag-id", name: "Target tag", slug: "source-tag" }],
			translations: [
				{
					id: "existing-translation-id",
					lang: "ja",
					title: "Existing target title",
					summary: "Existing summary",
					contentType: "link",
					content: "https://example.com/current",
					status: "published",
					publishedAt: "2026-10-04T00:00:00.000Z",
				},
			],
		},
	],
	tags: [{ id: "target-tag-id", name: "Target tag", slug: "source-tag" }],
} as const;

function createOriginal() {
	const parsed = parseDataImportText(JSON.stringify([sourceData]));
	if (!parsed.success) throw new Error("Valid source data did not parse.");
	return parsed.original;
}

describe("data import state boundaries and local planning", () => {
	it("keeps original, target snapshot, and editable draft independent during planning", () => {
		const original = createOriginal();
		const source = getDataImportSource(original, "0");
		if (!source) throw new Error("Expected source entry.");
		const targetCurrent = snapshotDataImportTarget(targetData);
		const initialDraft = createDataImportDraft(source, 0, 1);
		const originalText = original.rawText;
		const targetText = JSON.stringify(targetCurrent);
		const initialPlan = planDataImportDraft(initialDraft, targetCurrent);
		const editedDraft = updateDataImportNewsChoice(initialDraft, 0, {
			newsIndex: 0,
			action: "rename",
			mode: "manual",
			targetSlug: "welcome-copy",
		});
		const editedPlan = planDataImportDraft(editedDraft, targetCurrent);

		expect(initialPlan.plan.news[0]).toMatchObject({ action: "unresolved", isDuplicate: true });
		expect(initialPlan.plan.ready).toBe(false);
		expect(editedPlan.plan.news[0]).toMatchObject({
			action: "create",
			duplicateDecision: "rename-manual",
			targetSlug: "welcome-copy",
		});
		expect(editedPlan.preparedNews[0]?.targetNewsId).toBe("existing-news-id");
		expect(editedPlan.preparedNews[0]?.translations[0]?.content).toBe("# Original content");
		expect(original.rawText).toBe(originalText);
		expect(original.entries[0]?.news[0]?.slug).toBe("welcome");
		expect(JSON.stringify(targetCurrent)).toBe(targetText);
		expect(Object.isFrozen(targetCurrent)).toBe(true);
		expect(Object.isFrozen(editedDraft.source)).toBe(true);
		expect(editedDraft.source).not.toBe(original.entries[0]);
		expect(editedPlan.targetCurrent.news[0]?.translations[0]?.title).toBe("Existing target title");
	});

	it("keeps a server approval separate and commit-ready only for its exact request", () => {
		const source = getDataImportSource(createOriginal(), "0");
		if (!source) throw new Error("Expected source entry.");
		let draft = createDataImportDraft(source, 0, 5);
		draft = updateDataImportNewsChoice(draft, 0, {
			newsIndex: 0,
			action: "rename",
			mode: "manual",
			targetSlug: "welcome-copy",
		});
		const request = buildDataImportRequest(draft);
		const localPlan = planDataImportDraft(draft, snapshotDataImportTarget(targetData));
		const approval = {
			requestFingerprint: getDataImportRequestFingerprint(request),
			previewToken: "server-approved-token",
		};

		expect(isDataImportCommitReady(localPlan.plan.ready, approval, request)).toBe(true);
		const changedDraft = updateDataImportNewsChoice(draft, 0, { newsIndex: 0, action: "skip" });
		expect(
			isDataImportCommitReady(
				planDataImportDraft(changedDraft, snapshotDataImportTarget(targetData)).plan.ready,
				approval,
				buildDataImportRequest(changedDraft),
			),
		).toBe(false);
	});
});
