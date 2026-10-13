import { z } from "@hono/zod-openapi";

import { newsSlugSchema, publishedNewsDtoSchema } from "./news";
import { scopeDtoSchema } from "./scope";
import { tagDtoSchema } from "./tag";

export const dataExportScopeSchema = scopeDtoSchema
	.pick({ year: true, site: true, name: true, availableLanguages: true, defaultLanguage: true })
	.strict();

export const dataExportTagSchema = tagDtoSchema.pick({ name: true, slug: true }).strict();

const markdownTranslationSchema = publishedNewsDtoSchema.options[0]
	.pick({
		lang: true,
		title: true,
		summary: true,
		contentType: true,
		content: true,
		status: true,
		publishedAt: true,
	})
	.strict();
const linkTranslationSchema = publishedNewsDtoSchema.options[1]
	.pick({
		lang: true,
		title: true,
		summary: true,
		contentType: true,
		content: true,
		status: true,
		publishedAt: true,
	})
	.strict();

export const dataExportTranslationSchema = z.discriminatedUnion("contentType", [
	markdownTranslationSchema,
	linkTranslationSchema,
]);

export const dataExportNewsSchema = z
	.object({
		slug: newsSlugSchema,
		tags: z.array(tagDtoSchema.shape.slug),
		translations: z.array(dataExportTranslationSchema),
	})
	.strict();

export const scopeDataExportSchema = z
	.object({
		version: z.literal(1),
		exportedAt: z.iso.datetime(),
		scope: dataExportScopeSchema,
		tags: z.array(dataExportTagSchema),
		news: z.array(dataExportNewsSchema),
	})
	.strict();

export const dataExportSchema = z.array(scopeDataExportSchema);

export type DataExportScope = z.infer<typeof dataExportScopeSchema>;
export type DataExportTag = z.infer<typeof dataExportTagSchema>;
export type DataExportTranslation = z.infer<typeof dataExportTranslationSchema>;
export type DataExportNews = z.infer<typeof dataExportNewsSchema>;
export type ScopeDataExport = z.infer<typeof scopeDataExportSchema>;
export type DataExport = z.infer<typeof dataExportSchema>;
