import { z } from "@hono/zod-openapi";

export const apiErrorSchema = z.object({
	message: z.string(),
	details: z.record(z.string(), z.string()).optional(),
});
export const apiErrorEnvelopeSchema = z.object({ error: apiErrorSchema });

export function apiEnvelopeSchema<T extends z.ZodType>(data: T) {
	return z.object({ data });
}

export const assetUploadMaxBytes = 10 * 1024 * 1024;
export const assetUploadInputSchema = z.object({
	file: z.file().max(assetUploadMaxBytes).openapi({ type: "string", format: "binary" }),
});
export type AssetUploadInput = z.infer<typeof assetUploadInputSchema>;

export const newsQuerySchema = z.object({
	tag: z.string().optional(),
	cursor: z.string().optional(),
	limit: z.coerce.number().int().min(1).max(100).optional(),
	lang: z.string().trim().min(1).max(35).optional(),
});
export const adminNewsQuerySchema = newsQuerySchema.extend({
	search: z.string().trim().max(200).optional(),
	page: z.coerce.number().int().min(1).optional(),
});
export type NewsQuery = z.infer<typeof newsQuerySchema>;
export type AdminNewsQuery = z.infer<typeof adminNewsQuerySchema>;
