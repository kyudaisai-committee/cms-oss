import { OpenAPIHono } from "@hono/zod-openapi";
import type { AnyD1Database } from "drizzle-orm/d1";
import { afterEach, describe, expect, it, vi } from "vitest";

import { localActor } from "#web/api/access.server";
import type { ApiBindings } from "#web/api/context";
import { getDb } from "#web/lib/db.server";
import { CmsService } from "@repo/core/service.server";
import { dataExportSchema } from "@repo/core/types";

import { internalErrorResponse } from "../errors";
import type { ApiEnv } from "../utils";
import { adminExportRoutes } from "./export";

const environment = { DB: {} as unknown as AnyD1Database } satisfies Pick<ApiBindings, "DB">;

const exportedData = dataExportSchema.parse([
	{
		version: 1,
		exportedAt: "2026-10-05T03:00:00.000Z",
		scope: {
			year: 2026,
			site: "festival",
			name: "Festival",
			availableLanguages: ["ja"],
			defaultLanguage: "ja",
		},
		tags: [],
		news: [],
	},
]);

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

function createApp() {
	const service = new CmsService(getDb(environment), localActor, scope);
	const app = new OpenAPIHono<ApiEnv>();
	app.use("*", async (c, next) => {
		c.set("actor", localActor);
		c.set("service", service);
		await next();
	});
	app.onError((_error, c) => internalErrorResponse(c));
	app.route("/", adminExportRoutes);
	return app;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("admin data export routes", () => {
	it("downloads all scopes as a raw array with no-store and attachment headers", async () => {
		const exportAll = vi.spyOn(CmsService, "exportAll").mockResolvedValue(exportedData);

		const response = await createApp().request("/export", {}, environment);

		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(response.headers.get("Content-Disposition")).toBe(
			'attachment; filename="cms-export.json"',
		);
		const body: unknown = await response.json();
		expect(Array.isArray(body)).toBe(true);
		expect(body).toEqual(exportedData);
		expect(exportAll).toHaveBeenCalledOnce();
	});

	it("exports one scope through the scoped service route", async () => {
		const exportScope = vi
			.spyOn(CmsService.prototype, "exportScope")
			.mockResolvedValue(exportedData);

		const response = await createApp().request("/2026/festival/export", {}, environment);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(exportedData);
		expect(exportScope).toHaveBeenCalledOnce();
	});

	it("serves the generated top-level array JSON Schema", async () => {
		const response = await createApp().request("/export/schema", {}, environment);

		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		const jsonSchema: unknown = await response.json();
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
