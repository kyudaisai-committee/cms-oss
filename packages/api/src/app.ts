import { swaggerUI } from "@hono/swagger-ui";
import { $, OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";

import { CmsError } from "@repo/core/errors";

import { apiErrorEnvelopeSchema } from "./contracts";
import {
	httpExceptionResponse,
	internalErrorResponse,
	methodNotAllowed,
	cmsErrorResponse,
	validationErrorResponse,
} from "./errors";
import { actorMiddleware, createAccessJwtMiddleware, scopeMiddleware } from "./middleware";
import { adminAssetRoutes, publicAssetRoutes } from "./routes/assets";
import { adminAuditRoutes } from "./routes/audit";
import { adminExportRoutes } from "./routes/export";
import { adminImportRoutes } from "./routes/import";
import { adminNewsRoutes, publicNewsRoutes } from "./routes/news";
import { adminScopeRoutes, publicScopeRoutes } from "./routes/scopes";
import { adminTagRoutes, publicTagRoutes } from "./routes/tags";
import { cloudflareAccessSecurity, cloudflareAccessSecuritySchemes } from "./security";
import type { ApiEnv } from "./utils";

function createApp() {
	return new OpenAPIHono<ApiEnv>({
		defaultHook: (result, c) => {
			if (!result.success) return validationErrorResponse(c, result.error);
		},
	});
}

function notFound(c: Parameters<typeof internalErrorResponse>[0]) {
	return c.json(
		apiErrorEnvelopeSchema.parse({ error: { message: "Resource was not found." } }),
		404,
	);
}

function onError(error: Error, c: Parameters<typeof internalErrorResponse>[0]) {
	if (error instanceof CmsError) return cmsErrorResponse(c, error);
	if (error instanceof HTTPException) return httpExceptionResponse(c, error);
	return internalErrorResponse(c);
}

export type ApiAppOptions = {
	apiName: string;
	allowLocalFallback?: boolean;
};

export function createApiApp({ apiName, allowLocalFallback = false }: ApiAppOptions) {
	const publicApiBase = $(createApp().use("*", actorMiddleware).use("*", scopeMiddleware));
	publicApiBase.doc31("/openapi.json", {
		openapi: "3.2.0",
		info: {
			title: `${apiName} Public API`,
			version: "1.0.0",
			description: "Public, read-only CMS resources.",
		},
		servers: [{ url: "/api/v1" }],
	});
	publicApiBase.get("/docs", swaggerUI({ url: "/api/v1/openapi.json" }));
	publicApiBase.on(["POST", "PUT", "PATCH", "DELETE", "OPTIONS", "QUERY"], "/openapi.json", (c) =>
		methodNotAllowed(c, ["GET"]),
	);
	publicApiBase.on(["POST", "PUT", "PATCH", "DELETE", "OPTIONS", "QUERY"], "/docs", (c) =>
		methodNotAllowed(c, ["GET"]),
	);
	publicApiBase.onError(onError);
	publicApiBase.notFound(notFound);
	const publicApi = publicApiBase
		.route("/", publicScopeRoutes)
		.route("/", publicNewsRoutes)
		.route("/", publicTagRoutes)
		.route("/", publicAssetRoutes);

	const adminApiBase = $(createApp());
	adminApiBase.openAPIRegistry.registerComponent(
		"securitySchemes",
		"cloudflareAccessCookie",
		cloudflareAccessSecuritySchemes.cloudflareAccessCookie,
	);
	adminApiBase.openAPIRegistry.registerComponent(
		"securitySchemes",
		"cloudflareAccessClientId",
		cloudflareAccessSecuritySchemes.cloudflareAccessClientId,
	);
	adminApiBase.openAPIRegistry.registerComponent(
		"securitySchemes",
		"cloudflareAccessClientSecret",
		cloudflareAccessSecuritySchemes.cloudflareAccessClientSecret,
	);

	adminApiBase.use("*", createAccessJwtMiddleware(undefined, { allowLocalFallback }));
	adminApiBase.use("*", scopeMiddleware);
	adminApiBase.doc31("/openapi.json", {
		openapi: "3.2.0",
		info: {
			title: `${apiName} Admin API`,
			version: "1.0.0",
			description: "Administrative CMS resources protected by Cloudflare Access JWT verification.",
		},
		servers: [{ url: "/api/v1/admin" }],
		security: cloudflareAccessSecurity,
	});
	adminApiBase.get("/docs", swaggerUI({ url: "/api/v1/admin/openapi.json" }));
	adminApiBase.on(["POST", "PUT", "PATCH", "DELETE", "OPTIONS", "QUERY"], "/openapi.json", (c) =>
		methodNotAllowed(c, ["GET"]),
	);
	adminApiBase.on(["POST", "PUT", "PATCH", "DELETE", "OPTIONS", "QUERY"], "/docs", (c) =>
		methodNotAllowed(c, ["GET"]),
	);
	adminApiBase.onError(onError);
	adminApiBase.notFound(notFound);
	const adminApiWithRoutes = adminApiBase
		.route("/", adminScopeRoutes)
		.route("/", adminNewsRoutes)
		.route("/", adminExportRoutes)
		.route("/", adminImportRoutes)
		.route("/", adminTagRoutes)
		.route("/", adminAssetRoutes)
		.route("/", adminAuditRoutes);

	// Mount the protected app before the public app so its catch-all middleware
	// cannot intercept administrative requests.
	const apiBase = createApp();
	apiBase.onError(onError);
	apiBase.notFound(notFound);
	return apiBase.route("/admin", adminApiWithRoutes).route("/", publicApi);
}

export type ApiType = ReturnType<typeof createApiApp>;
