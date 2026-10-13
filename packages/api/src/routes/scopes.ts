import { createRoute, OpenAPIHono } from "@hono/zod-openapi";

import { withPublicNewsCacheInvalidation } from "#api/cache.server";
import { apiEnvelopeSchema, apiErrorEnvelopeSchema } from "#api/contracts";
import { getDb } from "#api/db.server";
import { CmsService } from "@repo/core/service.server";
import {
	ensureScopeInputSchema,
	scopeDtoSchema,
	scopeEnsureInputSchema,
	scopeRefSchema,
} from "@repo/core/types";

import { apiErrorResponses, methodNotAllowed, noStoreHeaders } from "../errors";
import type { ApiEnv } from "../utils";
import { envelope } from "../utils";

const list = createRoute({
	method: "get",
	path: "/scopes",
	responses: {
		...apiErrorResponses,
		200: {
			description: "Available content scopes",
			content: { "application/json": { schema: apiEnvelopeSchema(scopeDtoSchema.array()) } },
		},
	},
});

const ensureBody = createRoute({
	method: "post",
	path: "/scopes/ensure",
	request: {
		body: { required: true, content: { "application/json": { schema: scopeEnsureInputSchema } } },
	},
	responses: {
		...apiErrorResponses,
		200: {
			description: "Ensured scope",
			content: { "application/json": { schema: apiEnvelopeSchema(scopeDtoSchema) } },
		},
		201: {
			description: "Created scope",
			content: { "application/json": { schema: apiEnvelopeSchema(scopeDtoSchema) } },
		},
	},
});

const ensureBodyAtRoot = createRoute({
	method: "post",
	path: "/scopes",
	request: {
		body: { required: true, content: { "application/json": { schema: scopeEnsureInputSchema } } },
	},
	responses: {
		...apiErrorResponses,
		200: {
			description: "Ensured scope",
			content: { "application/json": { schema: apiEnvelopeSchema(scopeDtoSchema) } },
		},
	},
});

const ensureScoped = createRoute({
	method: "put",
	path: "/scopes/{year}/{site}",
	request: {
		params: scopeRefSchema,
		body: {
			required: false,
			content: { "application/json": { schema: ensureScopeInputSchema } },
		},
	},
	responses: {
		...apiErrorResponses,
		200: {
			description: "Ensured scope",
			content: { "application/json": { schema: apiEnvelopeSchema(scopeDtoSchema) } },
		},
		201: {
			description: "Created scope",
			content: { "application/json": { schema: apiEnvelopeSchema(scopeDtoSchema) } },
		},
		400: {
			description: "Invalid scope",
			content: { "application/json": { schema: apiErrorEnvelopeSchema } },
		},
	},
});

const updateScoped = createRoute({
	method: "patch",
	path: "/scopes/{year}/{site}",
	request: {
		params: scopeRefSchema,
		body: {
			required: true,
			content: { "application/json": { schema: ensureScopeInputSchema } },
		},
	},
	responses: {
		...apiErrorResponses,
		200: {
			description: "Updated scope",
			content: { "application/json": { schema: apiEnvelopeSchema(scopeDtoSchema) } },
		},
		409: {
			description: "Language is still in use",
			content: { "application/json": { schema: apiErrorEnvelopeSchema } },
		},
	},
});

export const publicScopeRoutes = new OpenAPIHono<ApiEnv>().openapi(list, async (c) =>
	c.json(envelope(await CmsService.listScopes(getDb(c.env))), 200, noStoreHeaders),
);

publicScopeRoutes.on(["POST", "PATCH", "DELETE", "OPTIONS", "QUERY"], "/scopes", (c) =>
	methodNotAllowed(c, ["GET"]),
);

export const adminScopeRoutes = new OpenAPIHono<ApiEnv>()
	.openapi(ensureBody, async (c) => {
		const body = c.req.valid("json");
		const result = await withPublicNewsCacheInvalidation(body, () =>
			CmsService.ensureScope(
				getDb(c.env),
				c.get("actor"),
				body,
				body.name,
				body.availableLanguages,
				body.defaultLanguage,
			),
		);
		return c.json(envelope(result), 200, noStoreHeaders);
	})
	.openapi(ensureBodyAtRoot, async (c) => {
		const body = c.req.valid("json");
		const result = await withPublicNewsCacheInvalidation(body, () =>
			CmsService.ensureScope(
				getDb(c.env),
				c.get("actor"),
				body,
				body.name,
				body.availableLanguages,
				body.defaultLanguage,
			),
		);
		return c.json(envelope(result), 200, noStoreHeaders);
	})
	.openapi(ensureScoped, async (c) => {
		const params = c.req.valid("param");
		const body = c.req.valid("json");
		const result = await withPublicNewsCacheInvalidation(params, () =>
			CmsService.ensureScope(
				getDb(c.env),
				c.get("actor"),
				params,
				body?.name,
				body?.availableLanguages,
				body?.defaultLanguage,
			),
		);
		return c.json(envelope(result), 200, noStoreHeaders);
	})
	.openapi(updateScoped, async (c) => {
		const params = c.req.valid("param");
		const result = await withPublicNewsCacheInvalidation(params, () =>
			CmsService.updateScope(getDb(c.env), c.get("actor"), params, c.req.valid("json")),
		);
		return c.json(envelope(result), 200, noStoreHeaders);
	});

adminScopeRoutes.on(["GET", "POST", "DELETE", "OPTIONS", "QUERY"], "/scopes/:year/:site", (c) =>
	methodNotAllowed(c, ["PUT", "PATCH"]),
);
