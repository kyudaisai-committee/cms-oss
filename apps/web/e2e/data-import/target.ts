import { expect } from "vitest";
import { z } from "zod";

import {
	adminNewsDtoSchema,
	adminNewsPageSchema,
	scopeDtoSchema,
	tagDtoSchema,
} from "@repo/core/types";
import type { AdminNewsDto } from "@repo/core/types";

import { execute, wranglerPath } from "./environment";
import {
	autoJapaneseSummary,
	autoJapaneseTitle,
	manualJapaneseSummary,
	manualJapaneseTitle,
	scheduledPublication,
} from "./fixture";

export const targetYear = 2081;
export const targetSite = "festival";
export const targetName = "隔離E2E取り込み先";

function parseApiData<TSchema extends z.ZodType>(
	schema: TSchema,
	responseBody: unknown,
): z.infer<TSchema> {
	const envelope = z.record(z.string(), z.unknown()).parse(responseBody);
	return schema.parse(envelope["data"]);
}

async function api<TSchema extends z.ZodType>(
	baseUrl: string,
	pathName: string,
	schema: TSchema,
	method = "GET",
	body?: unknown,
): Promise<z.infer<TSchema>> {
	const request: RequestInit = { method };
	if (body !== undefined) {
		request.headers = { "content-type": "application/json" };
		request.body = JSON.stringify(body);
	}
	const response = await fetch(`${baseUrl}/api/v1/admin${pathName}`, request);
	const text = await response.text();
	if (!response.ok) throw new Error(`${method} ${pathName}: ${response.status} ${text}`);
	const responseBody: unknown = JSON.parse(text);
	return parseApiData(schema, responseBody);
}

export async function seedTarget(baseUrl: string): Promise<void> {
	await api(baseUrl, "/scopes/ensure", scopeDtoSchema, "POST", {
		year: targetYear,
		site: targetSite,
		name: targetName,
		availableLanguages: ["ja", "en"],
		defaultLanguage: "en",
	});
	const tag = await api(baseUrl, `/${targetYear}/${targetSite}/tags`, tagDtoSchema, "POST", {
		name: "既存タグ名",
		slug: "reused-tag",
	});

	async function createNews(
		slug: string,
		lang: string,
		title: string,
		tagIds: string[] = [],
	): Promise<AdminNewsDto> {
		return api(baseUrl, `/${targetYear}/${targetSite}/news`, adminNewsDtoSchema, "POST", {
			slug,
			lang,
			title,
			summary: `既存概要 ${title}`,
			contentType: "markdown",
			content: `# ${title}`,
			tagIds,
		});
	}

	const auto = await createNews("duplicate-auto", "ja", "既存の自動記事", [tag.id]);
	await api(
		baseUrl,
		`/${targetYear}/${targetSite}/news/${auto.id}/translations/en`,
		adminNewsDtoSchema,
		"PUT",
		{
			title: "Existing English translation",
			summary: "Existing English summary",
			contentType: "link",
			content: "https://example.com/existing-en",
		},
	);
	await api(
		baseUrl,
		`/${targetYear}/${targetSite}/news/${auto.id}/publish`,
		adminNewsDtoSchema,
		"POST",
		{
			publishedAt: "2026-10-01T00:00:00.000Z",
		},
	);
	await api(
		baseUrl,
		`/${targetYear}/${targetSite}/news/${auto.id}/translations/en/publish`,
		adminNewsDtoSchema,
		"POST",
		{ publishedAt: "2026-10-02T00:00:00.000Z" },
	);
	await createNews("duplicate-manual", "ja", "既存の手入力記事");
	await createNews("duplicate-skip", "ja", "既存のスキップ記事");
}

async function apiNews(baseUrl: string): Promise<AdminNewsDto[]> {
	const page = await api(
		baseUrl,
		`/${targetYear}/${targetSite}/news?page=1&limit=100`,
		adminNewsPageSchema,
	);
	return page.items;
}

export async function verifyImportedTarget(
	baseUrl: string,
	databaseDirectory: string,
): Promise<void> {
	const scopesResponse = await fetch(`${baseUrl}/api/v1/scopes`);
	expect(scopesResponse.status).toBe(200);
	const scopesBody: unknown = await scopesResponse.json();
	const scopes = parseApiData(scopeDtoSchema.array(), scopesBody);
	const target = scopes.find((item) => item.year === targetYear && item.site === targetSite);
	if (!target) throw new Error("E2E scope must be in the isolated D1 database");
	expect(target.name).toBe(targetName);
	expect(target.availableLanguages).toEqual(["ja", "en", "de"]);
	expect(target.defaultLanguage).toBe("en");
	const news = await apiNews(baseUrl);
	expect(news.length).toBe(6);
	const bySlug = new Map(news.map((item) => [item.slug, item]));
	expect(bySlug.has("duplicate-auto-3")).toBe(true);
	expect(bySlug.has("duplicate-auto-2")).toBe(true);
	expect(bySlug.has("new-article")).toBe(true);
	expect(bySlug.has("duplicate-skip")).toBe(true);
	expect(bySlug.has("duplicate-skip-2")).toBe(false);
	expect(bySlug.get("duplicate-auto")?.title).toBe("Existing English translation");
	const committedAuto = bySlug.get("duplicate-auto-3");
	if (!committedAuto) throw new Error("the imported auto-renamed article must be present");
	const detailedAuto = await api(
		baseUrl,
		`/${targetYear}/${targetSite}/news/${committedAuto.id}?lang=ja`,
		adminNewsDtoSchema,
	);
	expect(detailedAuto.title).toBe(autoJapaneseTitle);
	expect(detailedAuto.summary).toBe(autoJapaneseSummary);
	expect(detailedAuto.status).toBe("published");
	expect(detailedAuto.publishedAt).toBe(scheduledPublication);
	const detailedAutoEnglish = await api(
		baseUrl,
		`/${targetYear}/${targetSite}/news/${committedAuto.id}?lang=en`,
		adminNewsDtoSchema,
	);
	expect(detailedAutoEnglish.contentType).toBe("link");
	expect(detailedAutoEnglish.content).toBe("https://example.com/source-fr");
	expect(detailedAutoEnglish.status).toBe("draft");
	expect(detailedAuto.tags[0]?.name).toBe("既存タグ名");
	const manual = bySlug.get("duplicate-auto-2");
	if (!manual) throw new Error("the imported manually renamed article must be present");
	const detailedManualJapanese = await api(
		baseUrl,
		`/${targetYear}/${targetSite}/news/${manual.id}?lang=ja`,
		adminNewsDtoSchema,
	);
	expect(detailedManualJapanese.title).toBe(manualJapaneseTitle);
	expect(detailedManualJapanese.summary).toBe(manualJapaneseSummary);
	const detailedManualEnglish = await api(
		baseUrl,
		`/${targetYear}/${targetSite}/news/${manual.id}?lang=en`,
		adminNewsDtoSchema,
	);
	expect(detailedManualEnglish.title).toBe("English manual article title first");
	const directQuery = await execute(wranglerPath, [
		"d1",
		"execute",
		"DB",
		"--local",
		"--persist-to",
		databaseDirectory,
		"--config",
		"wrangler.toml",
		"--command",
		`SELECT s.year, s.site, s.name, s.available_languages, n.slug, t.lang, t.title, t.content_type, t.status, t.published_at, t.content FROM scopes s JOIN news n ON n.scope_id = s.id LEFT JOIN news_translations t ON t.news_id = n.id AND t.deleted_at IS NULL WHERE s.year = ${targetYear} AND s.site = '${targetSite}' AND n.deleted_at IS NULL ORDER BY n.slug, t.lang`,
		"--json",
	]);
	const databaseRows: unknown = JSON.parse(directQuery.stdout);
	const serializedRows = JSON.stringify(databaseRows);
	expect(serializedRows).toMatch(/duplicate-auto-3/);
	expect(serializedRows).toMatch(/duplicate-auto-2/);
	expect(serializedRows).toMatch(/new-article/);
	expect(serializedRows).toMatch(/Source French link/);
}
