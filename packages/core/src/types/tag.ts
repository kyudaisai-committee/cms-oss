import { z } from "@hono/zod-openapi";

export const tagDtoSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	slug: z.string().min(1),
});
export type TagDto = z.infer<typeof tagDtoSchema>;

export const createTagInputSchema = z.object({ name: z.string(), slug: z.string() });
export const updateTagInputSchema = z.object({
	name: z.string().optional(),
	slug: z.string().optional(),
});
export type CreateTagInput = z.infer<typeof createTagInputSchema>;
export type UpdateTagInput = z.infer<typeof updateTagInputSchema>;
export type TagInput = CreateTagInput;
