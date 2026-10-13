import { OpenAPIHono } from "@hono/zod-openapi";
import { afterEach, describe, expect, it, vi } from "vitest";

const cachePurge = vi.hoisted(() => vi.fn(async () => ({ success: true })));
vi.mock("cloudflare:workers", () => ({ cache: { purge: cachePurge } }));

import { localActor } from "#web/api/access.server";
import { getDb } from "#web/lib/db.server";
import { CmsRepository } from "@repo/core/repository.server";
import { CmsService } from "@repo/core/service.server";
import type { AdminNewsDto } from "@repo/core/types";

import { publicApiApp } from "../app";
import type { ApiBindings } from "../context";
import type { ApiEnv } from "../utils";
import { adminNewsRoutes } from "./news";

function unusedR2Operation(): never {
	throw new Error("This test does not access the R2 binding.");
}

const environment = {
	DB: {} as unknown as Env["DB"],
	ASSETS: {
		head: unusedR2Operation,
		get: async () => null,
		put: unusedR2Operation,
		createMultipartUpload: unusedR2Operation,
		resumeMultipartUpload: unusedR2Operation,
		delete: async () => undefined,
		list: unusedR2Operation,
	},
} satisfies ApiBindings;

function setup() {
	const findScope = vi.spyOn(CmsRepository.prototype, "findScope").mockResolvedValue({
		id: "scope-1",
		year: 2026,
		site: "festival",
		name: "Festival",
		availableLanguages: ["ja", "en"],
		defaultLanguage: "ja",
		createdAt: new Date("2026-01-01T00:00:00.000Z"),
		updatedAt: new Date("2026-01-01T00:00:00.000Z"),
	});
	const listPublishedNews = vi
		.spyOn(CmsService.prototype, "listPublishedNews")
		.mockResolvedValue({ items: [], nextCursor: null });
	return { findScope, listPublishedNews };
}

afterEach(() => {
	vi.restoreAllMocks();
	cachePurge.mockClear();
});

describe("public news list query methods", () => {
	it("returns the same result for GET and QUERY", async () => {
		const { listPublishedNews } = setup();
		const path = "/2026/festival/news?tag=important&limit=10";
		const getResponse = await publicApiApp.request(path, {}, environment);
		const queryResponse = await publicApiApp.request(
			"/2026/festival/news",
			{
				method: "QUERY",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tag: "important", limit: 10 }),
			},
			environment,
		);

		expect(getResponse.status).toBe(200);
		expect(queryResponse.status).toBe(200);
		expect(getResponse.headers.get("Cache-Control")).toBe(
			"public, max-age=60, stale-while-revalidate=300",
		);
		expect(getResponse.headers.get("Cache-Tag")).toBe("cms-news-2026-festival");
		expect(queryResponse.headers.get("Cache-Control")).toBe("no-store");
		expect(queryResponse.headers.get("Cache-Tag")).toBeNull();
		expect(await getResponse.json()).toEqual(await queryResponse.json());
		expect(listPublishedNews).toHaveBeenNthCalledWith(1, {
			tagSlug: "important",
			cursor: undefined,
			limit: 10,
		});
		expect(listPublishedNews).toHaveBeenNthCalledWith(2, {
			tagSlug: "important",
			cursor: undefined,
			limit: 10,
		});
	});

	it("does not use URL query parameters as QUERY conditions", async () => {
		const { listPublishedNews } = setup();
		const response = await publicApiApp.request(
			"/2026/festival/news?tag=important&limit=10",
			{
				method: "QUERY",
				headers: { "Content-Type": "application/json" },
				body: "{}",
			},
			environment,
		);

		expect(response.status).toBe(200);
		expect(listPublishedNews).toHaveBeenCalledWith({
			tagSlug: undefined,
			cursor: undefined,
			limit: undefined,
		});
	});

	it("returns a structured 400 for invalid QUERY JSON", async () => {
		setup();
		const response = await publicApiApp.request(
			"/2026/festival/news",
			{
				method: "QUERY",
				headers: { "Content-Type": "application/json" },
				body: "{",
			},
			environment,
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: { message: "Malformed JSON in request body" },
		});
	});

	it("returns a structured 400 for a QUERY body that violates the schema", async () => {
		setup();
		const response = await publicApiApp.request(
			"/2026/festival/news",
			{
				method: "QUERY",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ limit: 0 }),
			},
			environment,
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: {
				message: "Request validation failed.",
				details: { limit: "Too small: expected number to be >=1" },
			},
		});
	});

	it("requires a QUERY request body", async () => {
		setup();
		const response = await publicApiApp.request(
			"/2026/festival/news",
			{
				method: "QUERY",
				headers: { "Content-Type": "application/json" },
			},
			environment,
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: { message: "Malformed JSON in request body" },
		});
	});

	it("advertises GET and QUERY for unsupported methods", async () => {
		setup();
		const response = await publicApiApp.request(
			"/2026/festival/news",
			{ method: "POST" },
			environment,
		);

		expect(response.status).toBe(405);
		expect(response.headers.get("Allow")).toBe("GET, QUERY");
	});

	it("passes lang query parameter in GET and body in QUERY to service", async () => {
		const { listPublishedNews } = setup();

		const getResponse = await publicApiApp.request("/2026/festival/news?lang=en", {}, environment);
		expect(getResponse.status).toBe(200);
		expect(listPublishedNews).toHaveBeenLastCalledWith({
			tagSlug: undefined,
			cursor: undefined,
			limit: undefined,
			lang: "en",
		});

		const queryResponse = await publicApiApp.request(
			"/2026/festival/news",
			{
				method: "QUERY",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ lang: "ja" }),
			},
			environment,
		);
		expect(queryResponse.status).toBe(200);
		expect(listPublishedNews).toHaveBeenLastCalledWith({
			tagSlug: undefined,
			cursor: undefined,
			limit: undefined,
			lang: "ja",
		});
	});

	it("passes lang to detail endpoint and defaults to undefined", async () => {
		setup();
		const getPublishedNews = vi.spyOn(CmsService.prototype, "getPublishedNews").mockResolvedValue({
			id: "news-1",
			scope: { year: 2026, site: "festival" },
			slug: "hello",
			title: "Hello",
			summary: null,
			contentType: "markdown",
			content: "# Hello",
			status: "published",
			publishedAt: "2026-01-01T00:00:00.000Z",
			lang: "en",
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
			tags: [],
		});

		const resWithoutLang = await publicApiApp.request("/2026/festival/news/hello", {}, environment);
		expect(resWithoutLang.status).toBe(200);
		expect(getPublishedNews).toHaveBeenLastCalledWith("hello", undefined);

		const resWithLang = await publicApiApp.request(
			"/2026/festival/news/hello?lang=en",
			{},
			environment,
		);
		expect(resWithLang.status).toBe(200);
		expect(getPublishedNews).toHaveBeenLastCalledWith("hello", "en");
	});
});

describe("admin news list filters", () => {
	it("passes the normalized search and page filters to the service", async () => {
		const scope = {
			id: "scope-1",
			year: 2026,
			site: "festival" as const,
			name: "Festival",
			availableLanguages: ["ja", "en"],
			defaultLanguage: "ja",
			createdAt: new Date("2026-01-01T00:00:00.000Z"),
			updatedAt: new Date("2026-01-01T00:00:00.000Z"),
		};
		const service = new CmsService(getDb(environment), localActor, scope);
		const listAdminNews = vi
			.spyOn(CmsService.prototype, "listAdminNews")
			.mockResolvedValue({ items: [], nextCursor: null });
		const app = new OpenAPIHono<ApiEnv>();
		app.use("*", async (c, next) => {
			c.set("service", service);
			await next();
		});
		app.route("/", adminNewsRoutes);

		const response = await app.request(
			"/2026/festival/news?tag=important&cursor=next&limit=10&lang=en&search=%20Needle%20",
			{},
			environment,
		);

		expect(response.status).toBe(200);
		expect(listAdminNews).toHaveBeenCalledWith({
			tagSlug: "important",
			cursor: "next",
			limit: 10,
			lang: "en",
			search: "Needle",
		});
	});

	it("passes the requested page and returns the matching total count", async () => {
		const scope = {
			id: "scope-1",
			year: 2026,
			site: "festival" as const,
			name: "Festival",
			availableLanguages: ["ja", "en"],
			defaultLanguage: "ja",
			createdAt: new Date("2026-01-01T00:00:00.000Z"),
			updatedAt: new Date("2026-01-01T00:00:00.000Z"),
		};
		const service = new CmsService(getDb(environment), localActor, scope);
		const listAdminNews = vi
			.spyOn(CmsService.prototype, "listAdminNews")
			.mockResolvedValue({ items: [], nextCursor: null, totalCount: 21 });
		const app = new OpenAPIHono<ApiEnv>();
		app.use("*", async (c, next) => {
			c.set("service", service);
			await next();
		});
		app.route("/", adminNewsRoutes);

		const response = await app.request("/2026/festival/news?page=2&limit=10", {}, environment);

		expect(response.status).toBe(200);
		expect(listAdminNews).toHaveBeenCalledWith({
			tagSlug: undefined,
			cursor: undefined,
			limit: 10,
			lang: undefined,
			search: undefined,
			page: 2,
		});
		expect(await response.json()).toMatchObject({ data: { totalCount: 21 } });
	});
});

describe("admin news cache invalidation", () => {
	it("purges all public news variants in the updated scope after a successful create", async () => {
		const scope = {
			id: "scope-1",
			year: 2026,
			site: "festival" as const,
			name: "Festival",
			availableLanguages: ["ja"],
			defaultLanguage: "ja",
			createdAt: new Date("2026-01-01T00:00:00.000Z"),
			updatedAt: new Date("2026-01-01T00:00:00.000Z"),
		};
		const service = new CmsService(getDb(environment), localActor, scope);
		const createdNews: AdminNewsDto = {
			id: "news-1",
			scope: { year: 2026, site: "festival" },
			slug: "fresh",
			title: "Fresh",
			summary: null,
			contentType: "markdown",
			content: "# Fresh",
			status: "draft",
			publishedAt: null,
			lang: "ja",
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
			tags: [],
			createdBy: localActor.id,
			updatedBy: localActor.id,
		};
		vi.spyOn(CmsService.prototype, "createNews").mockResolvedValue(createdNews);
		const app = new OpenAPIHono<ApiEnv>();
		app.use("*", async (c, next) => {
			c.set("service", service);
			await next();
		});
		app.route("/", adminNewsRoutes);

		const response = await app.request(
			"/2026/festival/news",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					slug: "fresh",
					title: "Fresh",
					contentType: "markdown",
					content: "# Fresh",
				}),
			},
			environment,
		);

		expect(response.status).toBe(201);
		expect(cachePurge).toHaveBeenCalledWith({ tags: ["cms-news-2026-festival"] });
	});
});
