import { OpenAPIHono } from "@hono/zod-openapi";
import type { AnyD1Database } from "drizzle-orm/d1";
import { HTTPException } from "hono/http-exception";
import { afterEach, describe, expect, it, vi } from "vitest";

const cachePurge = vi.hoisted(() => vi.fn(async () => ({ success: true })));
vi.mock("cloudflare:workers", () => ({ cache: { purge: cachePurge } }));

import { localActor } from "#web/api/access.server";
import type { ApiBindings } from "#web/api/context";
import { getDb } from "#web/lib/db.server";
import { CmsService } from "@repo/core/service.server";
import {
	dataExportSchema,
	dataImportPreviewResponseSchema,
	dataImportResultSchema,
} from "@repo/core/types";

import { internalErrorResponse, httpExceptionResponse } from "../errors";
import type { ApiEnv } from "../utils";
import { adminImportRoutes } from "./import";

const environment = { DB: {} as unknown as AnyD1Database } satisfies Pick<ApiBindings, "DB">;

const scope = {
	id: "scope-1",
	year: 2026,
	site: "festival",
	name: "Festival",
	availableLanguages: ["ja"],
	defaultLanguage: "ja",
	createdAt: new Date("2026-01-01T00:00:00.000Z"),
	updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const request = {
	source: dataExportSchema.parse([
		{
			version: 1,
			exportedAt: "2026-10-05T03:00:00.000Z",
			scope: {
				year: 2025,
				site: "source",
				name: "Source",
				availableLanguages: ["ja"],
				defaultLanguage: "ja",
			},
			tags: [],
			news: [],
		},
	])[0]!,
	newsDecisions: [],
	languageDecisions: [],
};

const preview = dataImportPreviewResponseSchema.parse({
	targetCurrent: {
		scope: {
			id: "scope-1",
			year: 2026,
			site: "festival",
			name: "Festival",
			availableLanguages: ["ja"],
			defaultLanguage: "ja",
		},
		news: [],
		tags: [],
	},
	previewToken: "preview-token",
	plan: {
		news: [],
		tags: [],
		languagesToAdd: [],
		languageMappings: [],
		unresolvedLanguages: [],
		unresolvedNewsIndexes: [],
		errors: [],
		ready: true,
		summary: {
			newsToCreate: 0,
			newsToSkip: 0,
			translationsToCreate: 0,
			tagsToCreate: 0,
			tagsToReuse: 0,
			languagesToAdd: 0,
		},
	},
});

const result = dataImportResultSchema.parse({
	createdNews: 0,
	skippedNews: 0,
	createdTranslations: 0,
	createdTags: 0,
	reusedTags: 0,
	addedLanguages: [],
	newsSlugs: [],
	targetCurrent: preview.targetCurrent,
});

function createApp() {
	const service = new CmsService(getDb(environment), localActor, scope);
	const app = new OpenAPIHono<ApiEnv>();
	app.use("*", async (c, next) => {
		c.set("actor", localActor);
		c.set("service", service);
		await next();
	});
	app.onError((error, c) =>
		error instanceof HTTPException ? httpExceptionResponse(c, error) : internalErrorResponse(c),
	);
	app.route("/", adminImportRoutes);
	return app;
}

afterEach(() => {
	vi.restoreAllMocks();
	cachePurge.mockClear();
});

describe("admin data import routes", () => {
	it("returns a no-store preview without writing or purging cache", async () => {
		const previewDataImport = vi
			.spyOn(CmsService.prototype, "previewDataImport")
			.mockResolvedValue(preview);
		const importData = vi.spyOn(CmsService.prototype, "importData").mockResolvedValue(result);

		const response = await createApp().request(
			"/2026/festival/import/preview",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(request),
			},
			environment,
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(await response.json()).toEqual({ data: preview });
		expect(previewDataImport).toHaveBeenCalledWith(request);
		expect(importData).not.toHaveBeenCalled();
		expect(cachePurge).not.toHaveBeenCalled();
	});

	it("commits the scoped import and invalidates public cache after success", async () => {
		const importData = vi.spyOn(CmsService.prototype, "importData").mockResolvedValue(result);
		const response = await createApp().request(
			"/2026/festival/import",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ ...request, expectedPreviewToken: "preview-token" }),
			},
			environment,
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(await response.json()).toEqual({ data: result });
		expect(importData).toHaveBeenCalledOnce();
		expect(importData).toHaveBeenCalledWith({ ...request, expectedPreviewToken: "preview-token" });
		expect(cachePurge).toHaveBeenCalledWith({ tags: ["cms-news-2026-festival"] });
	});

	it("does not purge cache when fresh-state validation rejects a stale commit", async () => {
		vi.spyOn(CmsService.prototype, "importData").mockRejectedValue(
			new HTTPException(409, { message: "Review the current data and preview again." }),
		);
		const response = await createApp().request(
			"/2026/festival/import",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ ...request, expectedPreviewToken: "stale-token" }),
			},
			environment,
		);

		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({
			error: { message: "Review the current data and preview again." },
		});
		expect(cachePurge).not.toHaveBeenCalled();
	});
});
