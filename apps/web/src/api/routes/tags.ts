import { createRoute, OpenAPIHono } from "@hono/zod-openapi";

import { withPublicNewsCacheInvalidation } from "#web/api/cache.server";
import {
	apiEnvelopeSchema,
	apiErrorEnvelopeSchema,
	createTagInputSchema,
	scopeRefSchema,
	tagDtoSchema,
	updateTagInputSchema,
} from "@repo/core/types";

import { apiErrorResponses, methodNotAllowed, noStoreHeaders } from "../errors";
import type { ApiEnv } from "../utils";
import { envelope, requireService } from "../utils";

const list = createRoute({
	method: "get",
	path: "/{year}/{site}/tags",
	request: { params: scopeRefSchema },
	responses: {
		...apiErrorResponses,
		200: {
			description: "Scope tags",
			content: { "application/json": { schema: apiEnvelopeSchema(tagDtoSchema.array()) } },
		},
	},
});
const adminList = createRoute({
	method: "get",
	path: "/{year}/{site}/tags",
	request: { params: scopeRefSchema },
	responses: {
		...apiErrorResponses,
		200: {
			description: "Scope tags",
			content: { "application/json": { schema: apiEnvelopeSchema(tagDtoSchema.array()) } },
		},
	},
});
const create = createRoute({
	method: "post",
	path: "/{year}/{site}/tags",
	request: {
		params: scopeRefSchema,
		body: { required: true, content: { "application/json": { schema: createTagInputSchema } } },
	},
	responses: {
		...apiErrorResponses,
		201: {
			description: "Created tag",
			content: { "application/json": { schema: apiEnvelopeSchema(tagDtoSchema) } },
		},
		409: {
			description: "Tag conflict",
			content: { "application/json": { schema: apiErrorEnvelopeSchema } },
		},
	},
});
const update = createRoute({
	method: "patch",
	path: "/{year}/{site}/tags/{id}",
	request: {
		params: scopeRefSchema.extend({ id: tagDtoSchema.shape.id }),
		body: { required: true, content: { "application/json": { schema: updateTagInputSchema } } },
	},
	responses: {
		...apiErrorResponses,
		200: {
			description: "Updated tag",
			content: { "application/json": { schema: apiEnvelopeSchema(tagDtoSchema) } },
		},
		409: {
			description: "Tag conflict",
			content: { "application/json": { schema: apiErrorEnvelopeSchema } },
		},
	},
});
const remove = createRoute({
	method: "delete",
	path: "/{year}/{site}/tags/{id}",
	request: { params: scopeRefSchema.extend({ id: tagDtoSchema.shape.id }) },
	responses: { ...apiErrorResponses, 204: { description: "Deleted tag" } },
});

export const publicTagRoutes = new OpenAPIHono<ApiEnv>().openapi(list, async (c) =>
	c.json(envelope(await requireService(c).listTags()), 200, noStoreHeaders),
);

publicTagRoutes.on(
	["POST", "PUT", "PATCH", "DELETE", "OPTIONS", "QUERY"],
	"/:year/:site/tags",
	(c) => methodNotAllowed(c, ["GET"]),
);

export const adminTagRoutes = new OpenAPIHono<ApiEnv>()
	.openapi(adminList, async (c) =>
		c.json(envelope(await requireService(c).listTags()), 200, noStoreHeaders),
	)
	.openapi(create, async (c) => {
		const params = c.req.valid("param");
		return c.json(
			envelope(
				await withPublicNewsCacheInvalidation(params, () =>
					requireService(c).createTag(c.req.valid("json")),
				),
			),
			201,
			noStoreHeaders,
		);
	})
	.openapi(update, async (c) => {
		const params = c.req.valid("param");
		return c.json(
			envelope(
				await withPublicNewsCacheInvalidation(params, () =>
					requireService(c).updateTag(params.id, c.req.valid("json")),
				),
			),
			200,
			noStoreHeaders,
		);
	})
	.openapi(remove, async (c) => {
		const params = c.req.valid("param");
		await withPublicNewsCacheInvalidation(params, () => requireService(c).deleteTag(params.id));
		return new Response(null, { status: 204, headers: noStoreHeaders });
	});

adminTagRoutes.on(["OPTIONS", "QUERY"], "/:year/:site/tags", (c) =>
	methodNotAllowed(c, ["GET", "POST"]),
);
adminTagRoutes.on(["OPTIONS", "QUERY"], "/:year/:site/tags/:id", (c) =>
	methodNotAllowed(c, ["PATCH", "DELETE"]),
);
