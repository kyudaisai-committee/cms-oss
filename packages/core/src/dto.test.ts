import type { InferSelectModel } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { news, newsTranslations, scopes } from "#core/db/schema";

import { toNewsSummaryDto, toPublishedNewsDto } from "./dto";

type NewsRecord = InferSelectModel<typeof news>;
type NewsTranslationRecord = InferSelectModel<typeof newsTranslations>;
type ScopeRecord = InferSelectModel<typeof scopes>;

const scope: Pick<ScopeRecord, "year" | "site"> = { year: 2026, site: "festival" };

function createNewsRecord(contentType: "markdown" | "link"): NewsRecord {
	const now = new Date("2026-09-12T00:00:00.000Z");
	return {
		id: `news-${contentType}`,
		scopeId: "scope-1",
		slug: contentType,
		createdAt: now,
		updatedAt: now,
		deletedAt: null,
		createdBy: "test",
		updatedBy: "test",
	};
}

function createTranslation(
	parent: NewsRecord,
	contentType: "markdown" | "link",
	content: string,
	lang: string,
): NewsTranslationRecord {
	return {
		id: `${parent.id}-${lang}`,
		newsId: parent.id,
		lang,
		title: contentType,
		summary: null,
		content,
		contentType,
		status: "published",
		publishedAt: parent.createdAt,
		createdAt: parent.createdAt,
		updatedAt: parent.updatedAt,
		deletedAt: null,
		createdBy: "test",
		updatedBy: "test",
	};
}

describe("news DTO content", () => {
	it("omits markdown content from public summaries but keeps it in details", () => {
		const record = createNewsRecord("markdown");
		const translation = createTranslation(record, "markdown", "# Full body", "en");

		expect(toNewsSummaryDto(record, translation, [], scope)).toMatchObject({
			contentType: "markdown",
			content: null,
			lang: "en",
		});
		expect(toPublishedNewsDto(record, translation, [], scope)).toMatchObject({
			contentType: "markdown",
			content: "# Full body",
			lang: "en",
		});
	});

	it("keeps link targets available in public summaries and details", () => {
		const record = createNewsRecord("link");
		const translation = createTranslation(record, "link", "https://example.com/news", "ja");

		expect(toNewsSummaryDto(record, translation, [], scope)).toMatchObject({
			contentType: "link",
			content: "https://example.com/news",
			lang: "ja",
		});
		expect(toPublishedNewsDto(record, translation, [], scope)).toMatchObject({
			contentType: "link",
			content: "https://example.com/news",
			lang: "ja",
		});
	});
});
