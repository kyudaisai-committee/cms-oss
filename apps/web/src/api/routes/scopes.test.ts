import { OpenAPIHono } from "@hono/zod-openapi";
import type { AnyD1Database } from "drizzle-orm/d1";
import { afterEach, describe, expect, it, vi } from "vitest";

const cachePurge = vi.hoisted(() => vi.fn(async () => ({ success: true })));
vi.mock("cloudflare:workers", () => ({ cache: { purge: cachePurge } }));

import { localActor } from "#web/api/access.server";
import { CmsService } from "@repo/core/service.server";
import type { ScopeDto } from "@repo/core/types";

import { internalErrorResponse } from "../errors";
import type { ApiEnv } from "../utils";
import { adminScopeRoutes } from "./scopes";

const environment = { DB: {} as unknown as AnyD1Database };

const scope: ScopeDto = {
	year: 2026,
	site: "festival",
	id: "scope-1",
	name: "Festival",
	availableLanguages: ["ja"],
	defaultLanguage: "ja",
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
};

function createApp() {
	const app = new OpenAPIHono<ApiEnv>();
	app.use("*", async (c, next) => {
		c.set("actor", localActor);
		await next();
	});
	app.onError((_error, c) => internalErrorResponse(c));
	app.route("/", adminScopeRoutes);
	return app;
}

async function sendScopeRequest(
	method: "PATCH" | "POST" | "PUT",
	path: string,
	body: Record<string, unknown>,
) {
	return createApp().request(
		path,
		{
			method,
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		},
		environment,
	);
}

afterEach(() => {
	vi.restoreAllMocks();
	cachePurge.mockClear();
});

describe("admin scope cache invalidation", () => {
	it.each([
		{
			name: "the explicit ensure route",
			method: "POST" as const,
			path: "/scopes/ensure",
			body: { year: 2026, site: "festival", defaultLanguage: "ja" },
		},
		{
			name: "the root ensure route",
			method: "POST" as const,
			path: "/scopes",
			body: { year: 2026, site: "festival", defaultLanguage: "ja" },
		},
		{
			name: "the scoped ensure route",
			method: "PUT" as const,
			path: "/scopes/2026/festival",
			body: { defaultLanguage: "ja" },
		},
		{
			name: "the scoped update route",
			method: "PATCH" as const,
			path: "/scopes/2026/festival",
			body: { defaultLanguage: "ja" },
		},
	])("purges the scope news cache after $name succeeds", async ({ method, path, body }) => {
		vi.spyOn(CmsService, "ensureScope").mockResolvedValue(scope);
		vi.spyOn(CmsService, "updateScope").mockResolvedValue(scope);

		const response = await sendScopeRequest(method, path, body);

		expect(response.status).toBe(200);
		expect(cachePurge).toHaveBeenCalledOnce();
		expect(cachePurge).toHaveBeenCalledWith({ tags: ["cms-news-2026-festival"] });
	});

	it("does not purge the scope news cache when an update fails", async () => {
		vi.spyOn(CmsService, "updateScope").mockRejectedValue(new Error("scope update failed"));

		const response = await sendScopeRequest("PATCH", "/scopes/2026/festival", {
			defaultLanguage: "ja",
		});

		expect(response.status).toBe(500);
		expect(cachePurge).not.toHaveBeenCalled();
	});
});
