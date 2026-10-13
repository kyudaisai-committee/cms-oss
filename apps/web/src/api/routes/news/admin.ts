import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import { withPublicNewsCacheInvalidation } from "#web/api/cache.server";
import {
	adminNewsDtoSchema,
	adminNewsPageSchema,
	adminNewsQuerySchema,
	newsIdSchema,
	apiEnvelopeSchema,
	apiErrorEnvelopeSchema,
	createNewsInputSchema,
	createNewsTranslationInputSchema,
	publishNewsInputSchema,
	scopeRefSchema,
	type ScopeRef,
	updateNewsInputSchema,
	updateNewsTranslationInputSchema,
} from "@repo/core/types";

import { apiErrorResponses, methodNotAllowed, noStoreHeaders } from "../../errors";
import type { ApiEnv } from "../../utils";
import { envelope, requireService } from "../../utils";

const adminDetailQuerySchema = z.object({
	lang: z.string().trim().min(1).max(35).optional(),
});

const adminList = createRoute({
	method: "get",
	path: "/{year}/{site}/news",
	request: { params: scopeRefSchema, query: adminNewsQuerySchema },
	responses: {
		...apiErrorResponses,
		200: {
			description: "All news",
			content: { "application/json": { schema: apiEnvelopeSchema(adminNewsPageSchema) } },
		},
	},
});

const adminCreate = createRoute({
	method: "post",
	path: "/{year}/{site}/news",
	request: {
		params: scopeRefSchema,
		body: {
			required: true,
			content: { "application/json": { schema: createNewsInputSchema } },
		},
	},
	responses: {
		...apiErrorResponses,
		201: {
			description: "Created news",
			content: { "application/json": { schema: apiEnvelopeSchema(adminNewsDtoSchema) } },
		},
		409: {
			description: "Slug conflict",
			content: { "application/json": { schema: apiErrorEnvelopeSchema } },
		},
	},
});

const adminDetail = createRoute({
	method: "get",
	path: "/{year}/{site}/news/{id}",
	request: {
		params: scopeRefSchema.extend({ id: newsIdSchema }),
		query: adminDetailQuerySchema,
	},
	responses: {
		...apiErrorResponses,
		200: {
			description: "News",
			content: { "application/json": { schema: apiEnvelopeSchema(adminNewsDtoSchema) } },
		},
	},
});

const adminUpdate = createRoute({
	method: "patch",
	path: "/{year}/{site}/news/{id}",
	request: {
		params: scopeRefSchema.extend({ id: newsIdSchema }),
		body: {
			required: true,
			content: { "application/json": { schema: updateNewsInputSchema } },
		},
	},
	responses: {
		...apiErrorResponses,
		200: {
			description: "Updated news",
			content: { "application/json": { schema: apiEnvelopeSchema(adminNewsDtoSchema) } },
		},
		409: {
			description: "Slug conflict",
			content: { "application/json": { schema: apiErrorEnvelopeSchema } },
		},
	},
});

const adminDelete = createRoute({
	method: "delete",
	path: "/{year}/{site}/news/{id}",
	request: { params: scopeRefSchema.extend({ id: newsIdSchema }) },
	responses: {
		...apiErrorResponses,
		204: { description: "Deleted news" },
	},
});

const publish = createRoute({
	method: "post",
	path: "/{year}/{site}/news/{id}/publish",
	request: {
		params: scopeRefSchema.extend({ id: newsIdSchema }),
		body: {
			required: false,
			content: { "application/json": { schema: publishNewsInputSchema } },
		},
	},
	responses: {
		...apiErrorResponses,
		200: {
			description: "Published news",
			content: { "application/json": { schema: apiEnvelopeSchema(adminNewsDtoSchema) } },
		},
	},
});

const unpublish = createRoute({
	method: "post",
	path: "/{year}/{site}/news/{id}/unpublish",
	request: { params: scopeRefSchema.extend({ id: newsIdSchema }) },
	responses: {
		...apiErrorResponses,
		200: {
			description: "Unpublished news",
			content: { "application/json": { schema: apiEnvelopeSchema(adminNewsDtoSchema) } },
		},
	},
});

const translationCreate = createRoute({
	method: "put",
	path: "/{year}/{site}/news/{id}/translations/{lang}",
	request: {
		params: scopeRefSchema.extend({ id: newsIdSchema, lang: z.string().trim().min(1).max(35) }),
		body: {
			required: true,
			content: { "application/json": { schema: createNewsTranslationInputSchema } },
		},
	},
	responses: {
		...apiErrorResponses,
		200: {
			description: "Created translation",
			content: { "application/json": { schema: apiEnvelopeSchema(adminNewsDtoSchema) } },
		},
		409: {
			description: "Translation conflict",
			content: { "application/json": { schema: apiErrorEnvelopeSchema } },
		},
	},
});

const translationUpdate = createRoute({
	method: "patch",
	path: "/{year}/{site}/news/{id}/translations/{lang}",
	request: {
		params: scopeRefSchema.extend({ id: newsIdSchema, lang: z.string().trim().min(1).max(35) }),
		body: {
			required: true,
			content: { "application/json": { schema: updateNewsTranslationInputSchema } },
		},
	},
	responses: {
		...apiErrorResponses,
		200: {
			description: "Updated translation",
			content: { "application/json": { schema: apiEnvelopeSchema(adminNewsDtoSchema) } },
		},
	},
});

const translationPublish = createRoute({
	method: "post",
	path: "/{year}/{site}/news/{id}/translations/{lang}/publish",
	request: {
		params: scopeRefSchema.extend({ id: newsIdSchema, lang: z.string().trim().min(1).max(35) }),
		body: {
			required: false,
			content: { "application/json": { schema: publishNewsInputSchema } },
		},
	},
	responses: {
		...apiErrorResponses,
		200: {
			description: "Published translation",
			content: { "application/json": { schema: apiEnvelopeSchema(adminNewsDtoSchema) } },
		},
	},
});

const translationUnpublish = createRoute({
	method: "post",
	path: "/{year}/{site}/news/{id}/translations/{lang}/unpublish",
	request: {
		params: scopeRefSchema.extend({ id: newsIdSchema, lang: z.string().trim().min(1).max(35) }),
	},
	responses: {
		...apiErrorResponses,
		200: {
			description: "Unpublished translation",
			content: { "application/json": { schema: apiEnvelopeSchema(adminNewsDtoSchema) } },
		},
	},
});

function withNewsCacheInvalidation<T>(params: ScopeRef, write: () => Promise<T>) {
	return withPublicNewsCacheInvalidation(params, write);
}

export const adminNewsRoutes = new OpenAPIHono<ApiEnv>()
	.openapi(adminList, async (c) => {
		const query = c.req.valid("query");
		return c.json(
			envelope(
				await requireService(c).listAdminNews({
					tagSlug: query.tag,
					cursor: query.cursor,
					limit: query.limit,
					lang: query.lang,
					search: query.search,
					page: query.page,
				}),
			),
			200,
			noStoreHeaders,
		);
	})
	.openapi(adminCreate, async (c) =>
		c.json(
			envelope(
				await withNewsCacheInvalidation(c.req.valid("param"), () =>
					requireService(c).createNews(c.req.valid("json")),
				),
			),
			201,
			noStoreHeaders,
		),
	)
	.openapi(adminDetail, async (c) =>
		c.json(
			envelope(
				await requireService(c).getAdminNews(c.req.valid("param").id, c.req.valid("query").lang),
			),
			200,
			noStoreHeaders,
		),
	)
	.openapi(adminUpdate, async (c) =>
		c.json(
			envelope(
				await withNewsCacheInvalidation(c.req.valid("param"), () =>
					requireService(c).updateNews(c.req.valid("param").id, c.req.valid("json")),
				),
			),
			200,
			noStoreHeaders,
		),
	)
	.openapi(translationCreate, async (c) => {
		const params = c.req.valid("param");
		return c.json(
			envelope(
				await withNewsCacheInvalidation(params, () =>
					requireService(c).createNewsTranslation(params.id, params.lang, c.req.valid("json")),
				),
			),
			200,
			noStoreHeaders,
		);
	})
	.openapi(translationUpdate, async (c) => {
		const params = c.req.valid("param");
		return c.json(
			envelope(
				await withNewsCacheInvalidation(params, () =>
					requireService(c).updateNewsTranslation(params.id, params.lang, c.req.valid("json")),
				),
			),
			200,
			noStoreHeaders,
		);
	})
	.openapi(translationPublish, async (c) => {
		const params = c.req.valid("param");
		return c.json(
			envelope(
				await withNewsCacheInvalidation(params, () =>
					requireService(c).publishNewsTranslation(
						params.id,
						params.lang,
						c.req.valid("json") ?? {},
					),
				),
			),
			200,
			noStoreHeaders,
		);
	})
	.openapi(translationUnpublish, async (c) => {
		const params = c.req.valid("param");
		return c.json(
			envelope(
				await withNewsCacheInvalidation(params, () =>
					requireService(c).unpublishNewsTranslation(params.id, params.lang),
				),
			),
			200,
			noStoreHeaders,
		);
	})
	.openapi(adminDelete, async (c) => {
		const params = c.req.valid("param");
		await withNewsCacheInvalidation(params, () => requireService(c).deleteNews(params.id));
		return new Response(null, { status: 204, headers: noStoreHeaders });
	})
	.openapi(publish, async (c) => {
		const params = c.req.valid("param");
		return c.json(
			envelope(
				await withNewsCacheInvalidation(params, () =>
					requireService(c).publishNews(params.id, c.req.valid("json") ?? {}),
				),
			),
			200,
			noStoreHeaders,
		);
	})
	.openapi(unpublish, async (c) => {
		const params = c.req.valid("param");
		return c.json(
			envelope(
				await withNewsCacheInvalidation(params, () => requireService(c).unpublishNews(params.id)),
			),
			200,
			noStoreHeaders,
		);
	})
	.on(["OPTIONS", "QUERY"], "/:year/:site/news", (c) => methodNotAllowed(c, ["GET", "POST"]))
	.on(["OPTIONS", "QUERY"], "/:year/:site/news/:id", (c) =>
		methodNotAllowed(c, ["GET", "PATCH", "DELETE"]),
	);
