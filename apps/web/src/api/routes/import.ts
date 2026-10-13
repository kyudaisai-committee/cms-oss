import { createRoute, OpenAPIHono } from "@hono/zod-openapi";

import { withPublicNewsCacheInvalidation } from "#web/api/cache.server";
import {
	dataImportCommitRequestSchema,
	dataImportPreviewResponseSchema,
	dataImportRequestSchema,
	dataImportResultSchema,
	scopeRefSchema,
} from "@repo/core/types";

import { apiErrorResponses, methodNotAllowed, noStoreHeaders } from "../errors";
import type { ApiEnv } from "../utils";
import { envelope, requireService } from "../utils";

const previewImport = createRoute({
	method: "post",
	path: "/{year}/{site}/import/preview",
	request: {
		params: scopeRefSchema,
		body: { content: { "application/json": { schema: dataImportRequestSchema } } },
	},
	responses: {
		...apiErrorResponses,
		200: {
			description: "Read-only import preview and current target snapshot",
			content: { "application/json": { schema: dataImportPreviewResponseSchema } },
		},
	},
});

const executeImport = createRoute({
	method: "post",
	path: "/{year}/{site}/import",
	request: {
		params: scopeRefSchema,
		body: { content: { "application/json": { schema: dataImportCommitRequestSchema } } },
	},
	responses: {
		...apiErrorResponses,
		200: {
			description: "Imported new articles and tags into the current scope",
			content: { "application/json": { schema: dataImportResultSchema } },
		},
	},
});

export const adminImportRoutes = new OpenAPIHono<ApiEnv>()
	.openapi(previewImport, async (c) => {
		const preview = await requireService(c).previewDataImport(c.req.valid("json"));
		return c.json(envelope(preview), 200, noStoreHeaders);
	})
	.openapi(executeImport, async (c) => {
		const scope = c.req.valid("param");
		const result = await withPublicNewsCacheInvalidation(scope, () =>
			requireService(c).importData(c.req.valid("json")),
		);
		return c.json(envelope(result), 200, noStoreHeaders);
	});

adminImportRoutes.on(
	["GET", "PUT", "PATCH", "DELETE", "OPTIONS", "QUERY"],
	"/:year/:site/import/preview",
	(c) => methodNotAllowed(c, ["POST"]),
);
adminImportRoutes.on(
	["GET", "PUT", "PATCH", "DELETE", "OPTIONS", "QUERY"],
	"/:year/:site/import",
	(c) => methodNotAllowed(c, ["POST"]),
);
