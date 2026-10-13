import { z } from "zod";

import { newsContentTypeSchema, newsStatusSchema } from "./common";
import { dataExportScopeSchema, scopeDataExportSchema } from "./export";
import { newsSlugSchema } from "./news";
import { tagDtoSchema } from "./tag";

export const dataImportNewsDecisionSchema = z.union([
	z.object({ newsIndex: z.number().int().nonnegative(), action: z.literal("skip") }).strict(),
	z
		.object({
			newsIndex: z.number().int().nonnegative(),
			action: z.literal("rename"),
			mode: z.literal("auto"),
		})
		.strict(),
	z
		.object({
			newsIndex: z.number().int().nonnegative(),
			action: z.literal("rename"),
			mode: z.literal("manual"),
			targetSlug: z.string().nullable(),
		})
		.strict(),
]);

export const dataImportLanguageDecisionSchema = z.discriminatedUnion("action", [
	z.object({ sourceLanguage: z.string().min(1), action: z.literal("add") }).strict(),
	z
		.object({
			sourceLanguage: z.string().min(1),
			action: z.literal("map"),
			targetLanguage: z.string().min(1),
		})
		.strict(),
]);

export const dataImportRequestSchema = z
	.object({
		source: scopeDataExportSchema,
		newsDecisions: z.array(dataImportNewsDecisionSchema),
		languageDecisions: z.array(dataImportLanguageDecisionSchema),
	})
	.strict();

export const dataImportCommitRequestSchema = dataImportRequestSchema
	.extend({ expectedPreviewToken: z.string().min(1) })
	.strict();

export const dataImportTargetTranslationSchema = z
	.object({
		id: z.string().min(1),
		lang: z.string().min(1),
		title: z.string(),
		summary: z.string().nullable(),
		contentType: newsContentTypeSchema,
		content: z.string(),
		status: newsStatusSchema,
		publishedAt: z.iso.datetime().nullable(),
	})
	.strict();

export const dataImportTargetNewsSchema = z
	.object({
		id: z.string().min(1),
		slug: newsSlugSchema,
		tags: z.array(tagDtoSchema),
		translations: z.array(dataImportTargetTranslationSchema),
	})
	.strict();

export const dataImportTargetTagSchema = tagDtoSchema;

export const dataImportTargetCurrentSchema = z
	.object({
		scope: dataExportScopeSchema.extend({ id: z.string().min(1) }),
		news: z.array(dataImportTargetNewsSchema),
		tags: z.array(dataImportTargetTagSchema),
	})
	.strict();

export const dataImportTranslationPlanSchema = z
	.object({
		sourceLanguage: z.string().min(1),
		targetLanguage: z.string().min(1).nullable(),
		title: z.string(),
		contentType: newsContentTypeSchema,
		status: newsStatusSchema,
		publishedAt: z.iso.datetime().nullable(),
	})
	.strict();

export const dataImportNewsPlanSchema = z
	.object({
		newsIndex: z.number().int().nonnegative(),
		sourceSlug: newsSlugSchema,
		targetNewsId: z.string().min(1).nullable(),
		isDuplicate: z.boolean(),
		duplicateDecision: z.enum(["skip", "rename-auto", "rename-manual"]).nullable(),
		action: z.enum(["create", "skip", "unresolved"]),
		targetSlug: newsSlugSchema.nullable(),
		translations: z.array(dataImportTranslationPlanSchema),
	})
	.strict();

export const dataImportTagPlanSchema = z
	.object({
		sourceSlug: z.string().min(1),
		sourceName: z.string().min(1),
		action: z.enum(["create", "reuse"]),
		targetName: z.string().min(1),
	})
	.strict();

export const dataImportLanguageMappingSchema = z
	.object({ sourceLanguage: z.string().min(1), targetLanguage: z.string().min(1) })
	.strict();

export const dataImportSummarySchema = z
	.object({
		newsToCreate: z.number().int().nonnegative(),
		newsToSkip: z.number().int().nonnegative(),
		translationsToCreate: z.number().int().nonnegative(),
		tagsToCreate: z.number().int().nonnegative(),
		tagsToReuse: z.number().int().nonnegative(),
		languagesToAdd: z.number().int().nonnegative(),
	})
	.strict();

export const dataImportPlanSchema = z
	.object({
		news: z.array(dataImportNewsPlanSchema),
		tags: z.array(dataImportTagPlanSchema),
		languagesToAdd: z.array(z.string().min(1)),
		languageMappings: z.array(dataImportLanguageMappingSchema),
		unresolvedLanguages: z.array(z.string().min(1)),
		unresolvedNewsIndexes: z.array(z.number().int().nonnegative()),
		errors: z.array(z.string()),
		ready: z.boolean(),
		summary: dataImportSummarySchema,
	})
	.strict();

export const dataImportPreviewResponseSchema = z
	.object({
		targetCurrent: dataImportTargetCurrentSchema,
		previewToken: z.string().min(1),
		plan: dataImportPlanSchema,
	})
	.strict();

export const dataImportResultSchema = z
	.object({
		createdNews: z.number().int().nonnegative(),
		skippedNews: z.number().int().nonnegative(),
		createdTranslations: z.number().int().nonnegative(),
		createdTags: z.number().int().nonnegative(),
		reusedTags: z.number().int().nonnegative(),
		addedLanguages: z.array(z.string().min(1)),
		newsSlugs: z.array(
			z.object({ sourceSlug: newsSlugSchema, targetSlug: newsSlugSchema }).strict(),
		),
		targetCurrent: dataImportTargetCurrentSchema,
	})
	.strict();

export type DataImportNewsDecision = z.infer<typeof dataImportNewsDecisionSchema>;
export type DataImportLanguageDecision = z.infer<typeof dataImportLanguageDecisionSchema>;
export type DataImportRequest = z.infer<typeof dataImportRequestSchema>;
export type DataImportCommitRequest = z.infer<typeof dataImportCommitRequestSchema>;
export type DataImportTargetCurrent = z.infer<typeof dataImportTargetCurrentSchema>;
export type DataImportPlan = z.infer<typeof dataImportPlanSchema>;
export type DataImportPreviewResponse = z.infer<typeof dataImportPreviewResponseSchema>;
export type DataImportResult = z.infer<typeof dataImportResultSchema>;
