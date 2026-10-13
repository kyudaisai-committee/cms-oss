import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

import type { ApiBindings, ApiVariables } from "./context";

export type ApiEnv = { Bindings: ApiBindings; Variables: ApiVariables };

export function envelope<T>(data: T) {
	return { data };
}

export function requireService(c: Context<ApiEnv>) {
	const service = c.get("service");
	if (!service) throw new HTTPException(404, { message: "Scope was not found." });
	return service;
}
