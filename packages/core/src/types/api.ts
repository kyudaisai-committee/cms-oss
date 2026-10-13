import { z } from "@hono/zod-openapi";

export const apiErrorSchema = z.object({
	message: z.string(),
	details: z.record(z.string(), z.string()).optional(),
});
export const apiErrorEnvelopeSchema = z.object({ error: apiErrorSchema });
export function apiEnvelopeSchema<T extends z.ZodType>(data: T) {
	return z.object({ data });
}
