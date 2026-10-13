import type { MiddlewareHandler } from "hono";

function cacheControl(): MiddlewareHandler {
	return async (c, next) => {
		await next();
		if (!c.res.headers.has("Cache-Control")) c.header("Cache-Control", "no-store");
	};
}

export default cacheControl;
