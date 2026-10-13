import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, beforeAll, describe, expect, expectTypeOf, it, vi } from "vitest";

import { CmsError, type CmsErrorCode } from "@repo/core/errors";
import { CmsRepository } from "@repo/core/repository.server";
import { CmsService } from "@repo/core/service.server";

import { createApiApp } from "./app";
import { createApiClient } from "./client";
import type { ApiBindings } from "./context";

const apiName = "API test";
const apiApp = createApiApp({ apiName });
const teamDomain = "api-tests.cloudflareaccess.example";
const audience = "api-test-audience";
let privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];

beforeAll(async () => {
	const keys = await generateKeyPair("RS256");
	privateKey = keys.privateKey;
	const jwk = await exportJWK(keys.publicKey);
	const response = new Response(
		JSON.stringify({ keys: [{ ...jwk, kid: "api-test-key", alg: "RS256" }] }),
		{
			headers: { "Content-Type": "application/json" },
		},
	);
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => response.clone()),
	);
});

function accessToken(payload: Record<string, string>) {
	return new SignJWT(payload)
		.setProtectedHeader({ alg: "RS256", kid: "api-test-key" })
		.setIssuer(`https://${teamDomain}`)
		.setAudience(audience)
		.setIssuedAt()
		.setExpirationTime("5m")
		.sign(privateKey);
}

const accessEnvironment = {
	ACCESS_TEAM_DOMAIN: teamDomain,
	ACCESS_AUDIENCE: audience,
};
const environment = {
	DB: {} as unknown as ApiBindings["DB"],
	ASSETS: {} as unknown as ApiBindings["ASSETS"],
	...accessEnvironment,
} satisfies ApiBindings;
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

type OpenApiDocument = {
	openapi: string;
	paths: Record<
		string,
		{ get?: OpenApiOperation; post?: OpenApiOperation; query?: OpenApiOperation }
	>;
	security?: unknown;
	components?: { securitySchemes?: unknown };
};

type OpenApiOperation = {
	parameters?: Array<{ name?: string }>;
	requestBody?: {
		required?: boolean;
		content?: Record<string, unknown>;
	};
};

afterEach(() => {
	vi.restoreAllMocks();
});

describe("CMS API boundaries", () => {
	it("exposes the public QUERY operation through the typed client", () => {
		const query = createApiClient()[":year"][":site"].news.$query;
		expect(query).toBeTypeOf("function");
		expectTypeOf(query).toBeCallableWith({
			param: { year: 2026, site: "festival" },
			json: { tag: "important", cursor: "next", limit: 10 },
		});
	});

	it("exposes scoped import preview and commit operations through the typed client", () => {
		const client = createApiClient().admin[":year"][":site"];
		const importKey: keyof typeof client = "import";
		expect(importKey).toBe("import");
		const preview = client.import.preview.$post;
		const commit = client.import.$post;
		expect(preview).toBeTypeOf("function");
		expect(commit).toBeTypeOf("function");
		expectTypeOf(preview).toBeCallableWith({
			param: { year: 2026, site: "festival" },
			json: {
				source: {
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
				newsDecisions: [],
				languageDecisions: [],
			},
		});
	});

	it("publishes a public OpenAPI document without authentication", async () => {
		const response = await apiApp.request("/openapi.json");
		expect(response.status).toBe(200);
		const document = (await response.json()) as OpenApiDocument;
		expect(document).toMatchObject({
			openapi: "3.2.0",
			info: { title: `${apiName} Public API` },
		});
		const publicNewsPath = document.paths["/{year}/{site}/news"];
		expect(publicNewsPath).toEqual(
			expect.objectContaining({ get: expect.anything(), query: expect.anything() }),
		);
		expect(publicNewsPath?.query?.requestBody).toEqual(
			expect.objectContaining({
				required: true,
				content: { "application/json": expect.anything() },
			}),
		);
		for (const parameter of publicNewsPath?.query?.parameters ?? []) {
			expect(["tag", "cursor", "limit"]).not.toContain(parameter.name);
		}
		expect(Object.keys(document.paths).some((path) => path.startsWith("/admin/"))).toBe(false);
		expect(document.security).toBeUndefined();
		expect(document.components?.securitySchemes).toBeUndefined();
		expect((await apiApp.request("/docs")).status).toBe(200);
	});

	it("requires a JWT before serving the protected OpenAPI document and Swagger UI", async () => {
		for (const path of ["/admin/openapi.json", "/admin/docs"]) {
			const response = await apiApp.request(`https://cms.example${path}`);
			expect(response.status).toBe(403);
			expect(await response.json()).toEqual({ error: { message: "Forbidden." } });
		}
	});

	it("enables local Access fallback only when the factory option is explicitly enabled", async () => {
		const path = "/admin/openapi.json";
		const disabled = await apiApp.request(`http://127.0.0.1${path}`);
		const enabledApp = createApiApp({ apiName, allowLocalFallback: true });
		const enabled = await enabledApp.request(`http://127.0.0.1${path}`);
		const external = await enabledApp.request(`https://cms.example${path}`);

		expect(disabled.status).toBe(403);
		expect(enabled.status).toBe(200);
		expect(external.status).toBe(403);
		expect(await enabled.json()).toMatchObject({
			info: { title: `${apiName} Admin API` },
		});
	});

	it.each([
		{ code: "validation", status: 400, message: "The news input is invalid." },
		{ code: "not_found", status: 404, message: "The news item was not found." },
		{ code: "conflict", status: 409, message: "The news slug is already in use." },
	] satisfies Array<{ code: CmsErrorCode; status: number; message: string }>)(
		"maps CmsService $code errors to HTTP $status with the API error envelope",
		async ({ code, status, message }) => {
			vi.spyOn(CmsRepository.prototype, "findScope").mockResolvedValue(scope);
			vi.spyOn(CmsService.prototype, "createNews").mockRejectedValue(new CmsError(code, message));
			const localApi = createApiApp({ apiName, allowLocalFallback: true });
			const response = await localApi.request(
				"http://127.0.0.1/admin/2026/festival/news",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						slug: "fresh-news",
						title: "Fresh news",
						contentType: "markdown",
						content: "# Fresh news",
					}),
				},
				environment,
			);

			expect(response.status).toBe(status);
			expect(await response.json()).toEqual({ error: { message } });
		},
	);

	it("publishes an admin-only OpenAPI document with required Access security", async () => {
		const token = await accessToken({ sub: "editor-123", email: "editor@example.com" });
		const response = await apiApp.request(
			"/admin/openapi.json",
			{ headers: { "CF-Access-Jwt-Assertion": token } },
			accessEnvironment,
		);
		expect(response.status).toBe(200);
		const document = (await response.json()) as OpenApiDocument;
		expect(document).toMatchObject({
			openapi: "3.2.0",
			info: { title: `${apiName} Admin API` },
			security: [
				{ cloudflareAccessCookie: [] },
				{ cloudflareAccessClientId: [], cloudflareAccessClientSecret: [] },
			],
		});
		const pathKeys = Object.keys(document.paths);
		expect(pathKeys.length).toBeGreaterThan(0);
		expect(pathKeys.every((path) => !path.startsWith("/admin/"))).toBe(true);
		expect(pathKeys).toContain("/{year}/{site}/news");
		expect(pathKeys).toContain("/export");
		expect(pathKeys).toContain("/export/schema");
		expect(pathKeys).toContain("/{year}/{site}/export");
		expect(pathKeys).toContain("/{year}/{site}/import/preview");
		expect(pathKeys).toContain("/{year}/{site}/import");
		expect(document.paths["/{year}/{site}/import/preview"]?.post).toBeDefined();
		expect(document.paths["/{year}/{site}/import"]?.post).toBeDefined();
		const swagger = await apiApp.request(
			"/admin/docs",
			{ headers: { "CF-Access-Jwt-Assertion": token } },
			accessEnvironment,
		);
		expect(swagger.status).toBe(200);
	});

	it("rejects identity headers without a verified JWT", async () => {
		const response = await apiApp.request("https://cms.example/admin/scopes", {
			headers: {
				"CF-Access-Authenticated-User-Email": "spoofed@example.com",
				"CF-Access-User-Id": "spoofed-user",
			},
		});
		expect(response.status).toBe(403);
	});

	it("requires a verified JWT for each export endpoint", async () => {
		for (const path of ["/admin/export", "/admin/export/schema", "/admin/2026/festival/export"]) {
			const response = await apiApp.request(`https://cms.example${path}`);
			expect(response.status).toBe(403);
		}
	});

	it("requires a verified JWT for scoped import preview and commit", async () => {
		for (const path of ["/admin/2026/festival/import/preview", "/admin/2026/festival/import"]) {
			const response = await apiApp.request(`https://cms.example${path}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "{}",
			});
			expect(response.status).toBe(403);
		}
	});

	it("keeps unknown resources structured", async () => {
		const response = await apiApp.request("/missing");
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: { message: "Resource was not found." } });
	});
});
