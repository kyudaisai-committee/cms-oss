import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import { getDb } from "#api/db.server";
import { CmsService } from "@repo/core/service.server";
import { dataExportSchema, scopeRefSchema } from "@repo/core/types";

import { apiErrorResponses, methodNotAllowed, noStoreHeaders } from "../errors";
import type { ApiEnv } from "../utils";
import { requireService } from "../utils";

const allExport = createRoute({
	method: "get",
	path: "/export",
	responses: {
		...apiErrorResponses,
		200: {
			description: "Export data for every scope",
			content: { "application/json": { schema: dataExportSchema } },
		},
	},
});

const scopeExport = createRoute({
	method: "get",
	path: "/{year}/{site}/export",
	request: { params: scopeRefSchema },
	responses: {
		...apiErrorResponses,
		200: {
			description: "Export data for one scope",
			content: { "application/json": { schema: dataExportSchema } },
		},
	},
});

const schemaExport = createRoute({
	method: "get",
	path: "/export/schema",
	responses: {
		...apiErrorResponses,
		200: {
			description: "JSON Schema for CMS data exports",
			content: { "application/json": { schema: z.record(z.string(), z.unknown()) } },
		},
	},
});

const exportHeaders = {
	...noStoreHeaders,
	"Content-Type": "application/json; charset=UTF-8",
	"Content-Disposition": 'attachment; filename="cms-export.json"',
};

export const adminExportRoutes = new OpenAPIHono<ApiEnv>()
	.openapi(allExport, async (c) =>
		c.body(JSON.stringify(await CmsService.exportAll(getDb(c.env))), 200, exportHeaders),
	)
	.openapi(scopeExport, async (c) =>
		c.body(JSON.stringify(await requireService(c).exportScope()), 200, exportHeaders),
	)
	.openapi(schemaExport, (c) => c.json(z.toJSONSchema(dataExportSchema), 200, noStoreHeaders));

adminExportRoutes.on(["POST", "PUT", "PATCH", "DELETE", "OPTIONS", "QUERY"], "/export", (c) =>
	methodNotAllowed(c, ["GET"]),
);
adminExportRoutes.on(
	["POST", "PUT", "PATCH", "DELETE", "OPTIONS", "QUERY"],
	"/:year/:site/export",
	(c) => methodNotAllowed(c, ["GET"]),
);
adminExportRoutes.on(
	["POST", "PUT", "PATCH", "DELETE", "OPTIONS", "QUERY"],
	"/export/schema",
	(c) => methodNotAllowed(c, ["GET"]),
);
