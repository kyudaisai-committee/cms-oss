import { z } from "zod";

export const newsContentTypeSchema = z.enum(["markdown", "link"]);
export const newsMarkdownContentSchema = z.string().trim().min(1).max(1_000_000);
export const newsLinkContentSchema = z.string().trim().min(1).max(2_048).pipe(z.httpUrl());
export const newsContentSchema = z.discriminatedUnion("contentType", [
	z.object({
		contentType: z.literal("markdown"),
		content: newsMarkdownContentSchema,
	}),
	z.object({
		contentType: z.literal("link"),
		content: newsLinkContentSchema,
	}),
]);
export const newsStatusSchema = z.enum(["draft", "published"]);
export type NewsContentType = z.infer<typeof newsContentTypeSchema>;
export type NewsContent = z.infer<typeof newsContentSchema>;
export type NewsStatus = z.infer<typeof newsStatusSchema>;

export const actorSchema = z.object({
	type: z.enum(["user", "service", "local"]),
	id: z.string().min(1),
	email: z.string().nullable(),
	label: z.string().min(1),
});
export type CmsActor = z.infer<typeof actorSchema>;
