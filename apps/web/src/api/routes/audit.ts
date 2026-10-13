import { createRoute, OpenAPIHono } from "@hono/zod-openapi";

import { apiEnvelopeSchema, auditDtoSchema, scopeRefSchema } from "@repo/core/types";

import { apiErrorResponses, methodNotAllowed, noStoreHeaders } from "../errors";
import type { ApiEnv } from "../utils";
import { envelope, requireService } from "../utils";

const list = createRoute({
	method: "get",
	path: "/{year}/{site}/audit-logs",
	request: { params: scopeRefSchema },
	responses: {
		...apiErrorResponses,
		200: {
			description: "Audit log entries",
			content: { "application/json": { schema: apiEnvelopeSchema(auditDtoSchema.array()) } },
		},
	},
});

export const adminAuditRoutes = new OpenAPIHono<ApiEnv>().openapi(list, async (c) =>
	c.json(envelope(await requireService(c).listAuditLogs()), 200, noStoreHeaders),
);

adminAuditRoutes.on(
	["POST", "PUT", "PATCH", "DELETE", "OPTIONS", "QUERY"],
	"/:year/:site/audit-logs",
	(c) => methodNotAllowed(c, ["GET"]),
);
