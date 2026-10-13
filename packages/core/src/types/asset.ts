import { z } from "@hono/zod-openapi";

import { scopeRefSchema } from "./scope";

export const createAssetInputSchema = z.object({
	objectKey: z.string(),
	filename: z.string(),
	mimeType: z.string(),
	size: z.number(),
});
export type CreateAssetInput = z.infer<typeof createAssetInputSchema>;
export const assetUploadMaxBytes = 10 * 1024 * 1024;
export const assetUploadInputSchema = z.object({
	file: z.file().max(assetUploadMaxBytes).openapi({ type: "string", format: "binary" }),
});
export type AssetUploadInput = z.infer<typeof assetUploadInputSchema>;
export const assetDtoSchema = z.object({
	id: z.string().min(1),
	scope: scopeRefSchema,
	objectKey: z.string(),
	filename: z.string(),
	mimeType: z.string(),
	size: z.number(),
	uploaderActor: z.string(),
	createdAt: z.iso.datetime(),
});
export type AssetDto = z.infer<typeof assetDtoSchema>;
export type AssetInput = CreateAssetInput;
