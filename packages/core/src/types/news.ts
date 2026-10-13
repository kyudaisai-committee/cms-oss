import { z } from "zod";

import { newsLinkContentSchema, newsMarkdownContentSchema, newsStatusSchema } from "./common";
import { scopeRefSchema } from "./scope";
import { tagDtoSchema } from "./tag";

export const newsIdSchema = z.string().min(1);
export const newsSlugSchema = z.string().min(1);

const newsSummaryBaseDtoSchema = z.object({
	id: newsIdSchema,
	scope: scopeRefSchema,
	slug: newsSlugSchema,
	title: z.string(),
	summary: z.string().nullable(),
	status: newsStatusSchema,
	publishedAt: z.iso.datetime().nullable(),
	lang: z.string().min(1),
	createdAt: z.iso.datetime(),
	updatedAt: z.iso.datetime(),
	tags: z.array(tagDtoSchema),
});
export const newsSummaryDtoSchema = z.discriminatedUnion("contentType", [
	newsSummaryBaseDtoSchema.extend({
		contentType: z.literal("markdown"),
		content: z.null(),
	}),
	newsSummaryBaseDtoSchema.extend({
		contentType: z.literal("link"),
		content: newsLinkContentSchema,
	}),
]);
export const publishedNewsDtoSchema = z.discriminatedUnion("contentType", [
	newsSummaryBaseDtoSchema.extend({
		contentType: z.literal("markdown"),
		content: newsMarkdownContentSchema,
	}),
	newsSummaryBaseDtoSchema.extend({
		contentType: z.literal("link"),
		content: newsLinkContentSchema,
	}),
]);
export const adminNewsDtoSchema = z.discriminatedUnion("contentType", [
	publishedNewsDtoSchema.options[0].extend({
		createdBy: z.string(),
		updatedBy: z.string(),
		translations: z
			.array(
				z.object({
					id: z.string().min(1),
					lang: z.string().min(1),
					title: z.string(),
					status: newsStatusSchema,
					publishedAt: z.iso.datetime().nullable(),
				}),
			)
			.optional(),
	}),
	publishedNewsDtoSchema.options[1].extend({
		createdBy: z.string(),
		updatedBy: z.string(),
		translations: z
			.array(
				z.object({
					id: z.string().min(1),
					lang: z.string().min(1),
					title: z.string(),
					status: newsStatusSchema,
					publishedAt: z.iso.datetime().nullable(),
				}),
			)
			.optional(),
	}),
]);
export type NewsSummaryDto = z.infer<typeof newsSummaryDtoSchema>;
export type PublishedNewsDto = z.infer<typeof publishedNewsDtoSchema>;
export type AdminNewsDto = z.infer<typeof adminNewsDtoSchema>;

const newsInputBaseSchema = z.object({
	slug: z.string(),
	title: z.string(),
	summary: z.string().nullable().optional(),
	tagIds: z.array(z.string()).optional(),
	publishedAt: z.iso.datetime().nullable().optional(),
	lang: z.string().trim().min(1).max(35).optional(),
});
export const createNewsInputSchema = z.discriminatedUnion("contentType", [
	newsInputBaseSchema.extend({
		contentType: z.literal("markdown"),
		content: newsMarkdownContentSchema,
	}),
	newsInputBaseSchema.extend({
		contentType: z.literal("link"),
		content: newsLinkContentSchema,
	}),
]);
const updateNewsInputBaseSchema = z.object({
	slug: z.string().optional(),
	title: z.string().optional(),
	summary: z.string().nullable().optional(),
	tagIds: z.array(z.string()).optional(),
	publishedAt: z.iso.datetime().nullable().optional(),
	lang: z.string().trim().min(1).max(35).optional(),
});
const updateNewsWithoutContentSchema = updateNewsInputBaseSchema.strict();
export const updateNewsInputSchema = z.union([
	updateNewsInputBaseSchema.extend({
		contentType: z.literal("markdown"),
		content: newsMarkdownContentSchema,
	}),
	updateNewsInputBaseSchema.extend({
		contentType: z.literal("link"),
		content: newsLinkContentSchema,
	}),
	updateNewsWithoutContentSchema,
]);
export const publishNewsInputSchema = z.object({
	publishedAt: z.iso.datetime().optional(),
});
export type CreateNewsInput = z.infer<typeof createNewsInputSchema>;
export type NewsInput = CreateNewsInput;
export type UpdateNewsInput = z.infer<typeof updateNewsInputSchema>;
export type PublishNewsInput = z.infer<typeof publishNewsInputSchema>;

const newsTranslationInputBaseSchema = z.object({
	title: z.string(),
	summary: z.string().nullable().optional(),
	publishedAt: z.iso.datetime().nullable().optional(),
});
export const createNewsTranslationInputSchema = z.discriminatedUnion("contentType", [
	newsTranslationInputBaseSchema.extend({
		contentType: z.literal("markdown"),
		content: newsMarkdownContentSchema,
	}),
	newsTranslationInputBaseSchema.extend({
		contentType: z.literal("link"),
		content: newsLinkContentSchema,
	}),
]);
export const updateNewsTranslationInputSchema = z.union([
	newsTranslationInputBaseSchema.extend({
		contentType: z.literal("markdown"),
		content: newsMarkdownContentSchema,
	}),
	newsTranslationInputBaseSchema.extend({
		contentType: z.literal("link"),
		content: newsLinkContentSchema,
	}),
	newsTranslationInputBaseSchema.strict(),
]);
export type CreateNewsTranslationInput = z.infer<typeof createNewsTranslationInputSchema>;
export type UpdateNewsTranslationInput = z.infer<typeof updateNewsTranslationInputSchema>;

export type NewsListOptions = {
	limit?: number | undefined;
	cursor?: string | undefined;
	tagSlug?: string | undefined;
	lang?: string | undefined;
	search?: string | undefined;
};
export type AdminNewsListOptions = NewsListOptions & {
	page?: number | undefined;
};
export const publishedNewsPageSchema = z.object({
	items: z.array(newsSummaryDtoSchema),
	nextCursor: z.string().nullable(),
});
export const adminNewsPageSchema = z.object({
	items: z.array(adminNewsDtoSchema),
	nextCursor: z.string().nullable(),
	totalCount: z.number().int().nonnegative().optional(),
});
export type PublishedNewsPage = z.infer<typeof publishedNewsPageSchema>;
export type AdminNewsPage = z.infer<typeof adminNewsPageSchema>;
