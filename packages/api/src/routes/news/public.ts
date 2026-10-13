import { createRoute, OpenAPIHono, z, type RouteHandler } from "@hono/zod-openapi";

import { publicNewsCacheHeaders } from "#api/cache.server";
import {
	apiEnvelopeSchema,
	apiErrorEnvelopeSchema,
	newsQuerySchema,
	type NewsQuery,
} from "#api/contracts";
import {
	newsSlugSchema,
	publishedNewsDtoSchema,
	publishedNewsPageSchema,
	scopeRefSchema,
} from "@repo/core/types";

import {
	apiErrorResponses,
	methodNotAllowed,
	noStoreHeaders,
	validationErrorResponse,
} from "../../errors";
import type { ApiEnv } from "../../utils";
import { envelope, requireService } from "../../utils";

const publicList = createRoute({
	method: "get",
	path: "/{year}/{site}/news",
	request: { params: scopeRefSchema, query: newsQuerySchema },
	responses: {
		...apiErrorResponses,
		200: {
			description: "Published news",
			content: {
				"application/json": { schema: apiEnvelopeSchema(publishedNewsPageSchema) },
			},
		},
	},
});

const publicQuery = createRoute({
	method: "query",
	path: "/{year}/{site}/news",
	request: {
		params: scopeRefSchema,
		body: {
			required: true,
			content: { "application/json": { schema: newsQuerySchema } },
		},
	},
	responses: {
		...apiErrorResponses,
		200: {
			description: "Published news",
			content: {
				"application/json": { schema: apiEnvelopeSchema(publishedNewsPageSchema) },
			},
		},
	},
});

const publicDetailQuerySchema = z.object({
	lang: z.string().trim().min(1).max(35).optional(),
});

const publicDetail = createRoute({
	method: "get",
	path: "/{year}/{site}/news/{slug}",
	request: {
		params: scopeRefSchema.extend({ slug: newsSlugSchema }),
		query: publicDetailQuerySchema,
	},
	responses: {
		...apiErrorResponses,
		200: {
			description: "Published news",
			content: {
				"application/json": { schema: apiEnvelopeSchema(publishedNewsDtoSchema) },
			},
		},
		404: {
			description: "News not found",
			content: { "application/json": { schema: apiErrorEnvelopeSchema } },
		},
	},
});

async function listPublishedNews(
	c:
		| Parameters<RouteHandler<typeof publicList, ApiEnv>>[0]
		| Parameters<RouteHandler<typeof publicQuery, ApiEnv>>[0],
	query: NewsQuery,
	headers: typeof noStoreHeaders | ReturnType<typeof publicNewsCacheHeaders>,
) {
	return c.json(
		envelope(
			await requireService(c).listPublishedNews({
				tagSlug: query.tag,
				cursor: query.cursor,
				limit: query.limit,
				lang: query.lang,
			}),
		),
		200,
		headers,
	);
}

function publicListHandler(
	c: Parameters<RouteHandler<typeof publicList, ApiEnv>>[0],
): ReturnType<RouteHandler<typeof publicList, ApiEnv>> {
	return listPublishedNews(c, c.req.valid("query"), publicNewsCacheHeaders(c.req.valid("param")));
}

function publicQueryHandler(
	c: Parameters<RouteHandler<typeof publicQuery, ApiEnv>>[0],
): ReturnType<RouteHandler<typeof publicQuery, ApiEnv>> {
	return listPublishedNews(c, c.req.valid("json"), noStoreHeaders);
}

export const publicNewsRoutes = new OpenAPIHono<ApiEnv>()
	.openapi(publicList, publicListHandler, (result, c) => {
		if (!result.success) return validationErrorResponse(c, result.error);
	})
	.openapi(publicQuery, publicQueryHandler, (result, c) => {
		if (!result.success) return validationErrorResponse(c, result.error);
	})
	.openapi(publicDetail, async (c) =>
		c.json(
			envelope(
				await requireService(c).getPublishedNews(
					c.req.valid("param").slug,
					c.req.valid("query").lang,
				),
			),
			200,
			publicNewsCacheHeaders(c.req.valid("param")),
		),
	);

publicNewsRoutes.on(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"], "/:year/:site/news", (c) =>
	methodNotAllowed(c, ["GET", "QUERY"]),
);
