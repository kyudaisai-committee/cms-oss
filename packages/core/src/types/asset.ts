import { z } from "zod";

import { scopeRefSchema } from "./scope";

export const createAssetInputSchema = z.object({
	objectKey: z.string(),
	filename: z.string(),
	mimeType: z.string(),
	size: z.number(),
});
export type CreateAssetInput = z.infer<typeof createAssetInputSchema>;
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
