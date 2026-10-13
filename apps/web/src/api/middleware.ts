import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";

import { localActor, verifyAccessJwt, type AccessJwtVerifier } from "#web/api/access.server";
import { getDb } from "#web/lib/db.server";
import { toScopeDto } from "@repo/core/dto";
import { CmsRepository } from "@repo/core/repository.server";
import { CmsService } from "@repo/core/service.server";
import { scopeRefSchema } from "@repo/core/types";

import type { ApiEnv } from "./utils";

export const actorMiddleware = createMiddleware<ApiEnv>(async (c, next) => {
	c.set("actor", localActor);
	c.set("authMethod", "local");
	await next();
});

const jwtAssertionHeader = "CF-Access-Jwt-Assertion";

export type AccessJwtMiddlewareOptions = {
	allowLocalFallback?: boolean;
};

function isLoopbackHost(request: Request) {
	const hostname = new URL(request.url).hostname;
	return (
		hostname === "localhost" ||
		hostname === "127.0.0.1" ||
		hostname === "::1" ||
		hostname === "[::1]"
	);
}

function canUseLocalFallback(request: Request, options: AccessJwtMiddlewareOptions) {
	return isLoopbackHost(request) && (options.allowLocalFallback ?? import.meta.env.DEV);
}

export function createAccessJwtMiddleware(
	verify: AccessJwtVerifier = verifyAccessJwt,
	options: AccessJwtMiddlewareOptions = {},
) {
	return createMiddleware<ApiEnv>(async (c, next) => {
		const assertionHeader = c.req.header(jwtAssertionHeader);
		if (assertionHeader === undefined) {
			if (canUseLocalFallback(c.req.raw, options)) {
				c.set("actor", localActor);
				c.set("authMethod", "local");
				await next();
				return;
			}
			throw new HTTPException(403, { message: "Forbidden." });
		}
		const assertion = assertionHeader.trim();
		if (!assertion) throw new HTTPException(403, { message: "Forbidden." });
		let actor: Awaited<ReturnType<AccessJwtVerifier>>;
		try {
			actor = await verify(assertion, c.env);
		} catch {
			throw new HTTPException(403, { message: "Forbidden." });
		}
		c.set("actor", actor);
		c.set("authMethod", "access-header");
		await next();
	});
}

export const accessJwtMiddleware = createAccessJwtMiddleware();

function scopeSegments(path: string) {
	const segments = path.split("/").filter(Boolean);
	if (segments[0] === "admin") return segments.slice(1, 3);
	return segments.slice(0, 2);
}

export const scopeMiddleware = createMiddleware<ApiEnv>(async (c, next) => {
	const [year, site] = scopeSegments(c.req.path);
	const parsed = scopeRefSchema.safeParse({ year, site });
	if (!parsed.success) {
		await next();
		return;
	}
	const repository = new CmsRepository(getDb(c.env));
	const scope = await repository.findScope(parsed.data);
	if (!scope) throw new HTTPException(404, { message: "Scope was not found." });
	c.set("scope", toScopeDto(scope));
	c.set("service", new CmsService(getDb(c.env), c.get("actor"), scope));
	await next();
});
