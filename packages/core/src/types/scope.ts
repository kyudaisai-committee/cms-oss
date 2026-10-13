import { z } from "@hono/zod-openapi";

export const siteSchema = z.string().trim().min(1);
export type Site = z.infer<typeof siteSchema>;

export const scopeRefSchema = z.object({
	year: z.coerce.number().int().min(1).max(9999),
	site: siteSchema,
});
export type ScopeRef = z.infer<typeof scopeRefSchema>;

export const scopeDtoSchema = scopeRefSchema.extend({
	id: z.string().min(1),
	name: z.string().min(1),
	availableLanguages: z.array(z.string().min(1)),
	defaultLanguage: z.string().min(1),
	createdAt: z.iso.datetime(),
	updatedAt: z.iso.datetime(),
});
export type ScopeDto = z.infer<typeof scopeDtoSchema>;

export const ensureScopeInputSchema = z.object({
	name: z.string().trim().min(1).max(200).optional(),
	availableLanguages: z.array(z.string().trim().min(1).max(35)).optional(),
	defaultLanguage: z.string().trim().min(1).max(35).optional(),
});
export const scopeEnsureInputSchema = scopeRefSchema.extend({
	name: z.string().trim().min(1).max(200).optional(),
	availableLanguages: z.array(z.string().trim().min(1).max(35)).optional(),
	defaultLanguage: z.string().trim().min(1).max(35).optional(),
});
export type EnsureScopeInput = z.infer<typeof ensureScopeInputSchema>;
export type ScopeEnsureInput = z.infer<typeof scopeEnsureInputSchema>;
