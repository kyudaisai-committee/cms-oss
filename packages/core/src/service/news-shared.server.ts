import "server-only";

import type { InferSelectModel } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";

import { news, newsTranslations, scopes, tags } from "#core/db/schema";
import { canonicalizeStoredLanguage, normalizeLang } from "#core/input";
import { CmsRepository } from "#core/repository.server";
import type { CmsActor } from "#core/types";

type ScopeRecord = InferSelectModel<typeof scopes>;
type NewsRecord = InferSelectModel<typeof news>;
type NewsTranslationRecord = InferSelectModel<typeof newsTranslations>;
type TagRecord = InferSelectModel<typeof tags>;

export function actorValue(actor: CmsActor) {
	return actor.label;
}

export function scopeValue(scope: ScopeRecord) {
	return { year: scope.year, site: scope.site };
}

export function scopeLanguage(scope: ScopeRecord, requested?: string) {
	const rawDefault = canonicalizeStoredLanguage(scope.defaultLanguage) ?? "ja";
	const lang = normalizeLang(requested, rawDefault);
	const available = scope.availableLanguages
		.map(canonicalizeStoredLanguage)
		.filter((value): value is string => value !== null);
	if (!available.includes(lang)) {
		throw new HTTPException(400, { message: "lang is not available in this scope." });
	}
	return lang;
}

export function translationSummary(translations: NewsTranslationRecord[]) {
	return translations.map((translation) => ({
		id: translation.id,
		lang: canonicalizeStoredLanguage(translation.lang) ?? translation.lang,
		title: translation.title,
		status: translation.status,
		publishedAt: translation.publishedAt,
	}));
}

export function changesForNews(record: NewsRecord, translation?: NewsTranslationRecord) {
	return {
		scopeId: record.scopeId,
		slug: record.slug,
		...(translation
			? {
					title: translation.title,
					summary: translation.summary,
					content: translation.content,
					contentType: translation.contentType,
					status: translation.status,
					publishedAt: translation.publishedAt?.toISOString() ?? null,
					lang: canonicalizeStoredLanguage(translation.lang) ?? translation.lang,
				}
			: {}),
		createdBy: record.createdBy,
		updatedBy: record.updatedBy,
	};
}

export async function requireNews(
	repository: CmsRepository,
	scopeId: string,
	id: string,
	lang?: string,
) {
	const result = await repository.findNewsById(scopeId, id, lang);
	if (!result) throw new HTTPException(404, { message: "News was not found." });
	return result;
}

export function tagIdsFromRows(rows: TagRecord[], requestedIds: string[]) {
	const found = new Set(rows.map((row) => row.id));
	const missing = requestedIds.find((id) => !found.has(id));
	if (missing) throw new HTTPException(404, { message: "Tag was not found in this scope." });
}
