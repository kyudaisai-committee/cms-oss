import { z } from "@hono/zod-openapi";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

import { apiErrorEnvelopeSchema } from "@repo/core/types";

import type { ApiEnv } from "./utils";

function errorEnvelope(value: unknown) {
	return apiErrorEnvelopeSchema.parse(value);
}

export function validationErrorResponse(c: Context<ApiEnv>, error: z.ZodError) {
	return c.json(
		errorEnvelope({
			error: {
				message: "Request validation failed.",
				details: Object.fromEntries(
					error.issues.map((issue) => [
						issue.path.length ? issue.path.join(".") : "request",
						issue.message,
					]),
				),
			},
		}),
		400,
	);
}

export function httpExceptionResponse(c: Context<ApiEnv>, error: HTTPException) {
	return c.json(
		errorEnvelope({
			error: { message: error.status >= 500 ? "Internal server error." : error.message },
		}),
		error.status,
	);
}

export function internalErrorResponse(c: Context<ApiEnv>) {
	return c.json(errorEnvelope({ error: { message: "Internal server error." } }), 500);
}

export function methodNotAllowed(c: Context<ApiEnv>, allow: readonly string[]) {
	c.header("Allow", allow.join(", "));
	return c.json(errorEnvelope({ error: { message: "Method not allowed." } }), 405);
}

export const noStoreHeaders = { "Cache-Control": "no-store" };
export const apiErrorResponses = {
	400: {
		description: "Invalid request",
		content: { "application/json": { schema: apiErrorEnvelopeSchema } },
	},
	404: {
		description: "Resource not found",
		content: { "application/json": { schema: apiErrorEnvelopeSchema } },
	},
	405: {
		description: "Method not allowed",
		headers: { Allow: { schema: { type: "string" } } },
		content: { "application/json": { schema: apiErrorEnvelopeSchema } },
	},
	409: {
		description: "Conflict",
		content: { "application/json": { schema: apiErrorEnvelopeSchema } },
	},
	413: {
		description: "Payload too large",
		content: { "application/json": { schema: apiErrorEnvelopeSchema } },
	},
	416: {
		description: "Range not satisfiable",
		headers: { "Content-Range": { schema: { type: "string" } } },
	},
	500: {
		description: "Internal server error",
		content: { "application/json": { schema: apiErrorEnvelopeSchema } },
	},
} as const;
