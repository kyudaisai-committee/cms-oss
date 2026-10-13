import { z } from "@hono/zod-openapi";
import { describe, expect, it } from "vitest";

import { dataExportSchema } from "./export";

const markdownTranslation = {
	lang: "ja",
	title: "お知らせ",
	summary: null,
	contentType: "markdown",
	content: "# お知らせ",
	status: "draft",
	publishedAt: null,
};

const linkTranslation = {
	lang: "en",
	title: "Notice",
	summary: "Read the announcement",
	contentType: "link",
	content: "https://example.com/news",
	status: "published",
	publishedAt: "2026-10-05T03:00:00.000Z",
};

const newsItem = {
	slug: "welcome",
	tags: ["important"],
	translations: [markdownTranslation, linkTranslation],
};

const validScopeExport = {
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
	news: [newsItem],
};

describe("CMS data export schema", () => {
	it("accepts multiple scopes with markdown and link translations", () => {
		expect(
			dataExportSchema.parse([
				validScopeExport,
				{ ...validScopeExport, scope: { ...validScopeExport.scope, year: 2027 } },
			]),
		).toHaveLength(2);
	});

	it("rejects unsupported versions and invalid content and timestamps", () => {
		expect(dataExportSchema.safeParse([{ ...validScopeExport, version: 2 }]).success).toBe(false);
		expect(
			dataExportSchema.safeParse([{ ...validScopeExport, format: "another-cms" }]).success,
		).toBe(false);
		expect(
			dataExportSchema.safeParse([
				{
					...validScopeExport,
					news: [
						{
							...newsItem,
							translations: [{ ...markdownTranslation, contentType: "video" }, linkTranslation],
						},
					],
				},
			]).success,
		).toBe(false);
		expect(
			dataExportSchema.safeParse([{ ...validScopeExport, exportedAt: "not-a-date" }]).success,
		).toBe(false);
		expect(
			dataExportSchema.safeParse([
				{
					...validScopeExport,
					news: [
						{
							...newsItem,
							translations: [
								markdownTranslation,
								{ ...linkTranslation, content: "javascript:alert(1)" },
							],
						},
					],
				},
			]).success,
		).toBe(false);
	});

	it("produces a versioned JSON Schema for the top-level array without an exporter name", () => {
		const jsonSchema = z.toJSONSchema(dataExportSchema);
		expect(jsonSchema).toMatchObject({
			type: "array",
			items: {
				type: "object",
				properties: { version: { const: 1 } },
			},
		});
		expect(jsonSchema).not.toHaveProperty("items.properties.format");
	});
});
