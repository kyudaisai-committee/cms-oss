import "server-only";

import type { InferSelectModel } from "drizzle-orm";

import { news, newsTranslations, tags } from "#core/db/schema";
import type { DataImportTargetState, DataImportWriteSet } from "#core/repository/import.server";
import type { CmsActor } from "#core/types";
import type { PlannedImport } from "@repo/core/import-plan";

import { actorValue } from "../news-shared.server";

type NewsRecord = InferSelectModel<typeof news>;
type NewsTranslationRecord = InferSelectModel<typeof newsTranslations>;
type TagRecord = InferSelectModel<typeof tags>;

export function makeDataImportWriteSet(
	state: DataImportTargetState,
	planned: PlannedImport,
	actor: CmsActor,
): DataImportWriteSet {
	const now = new Date();
	const actorLabel = actorValue(actor);
	const tagIds = new Map<string, string>();
	const createdTags: TagRecord[] = [];
	const reusedTags: Array<Pick<TagRecord, "id" | "name" | "slug">> = [];
	for (const tag of planned.preparedTags) {
		if (tag.action === "reuse" && tag.targetTagId !== null) {
			tagIds.set(tag.sourceSlug, tag.targetTagId);
			const targetTag = state.tags.find((candidate) => candidate.id === tag.targetTagId);
			if (targetTag) reusedTags.push(targetTag);
			continue;
		}
		const id = crypto.randomUUID();
		tagIds.set(tag.sourceSlug, id);
		createdTags.push({
			id,
			scopeId: state.scope.id,
			name: tag.name,
			slug: tag.slug,
			deletedAt: null,
		});
	}

	const createdNews: DataImportWriteSet["news"] = [];
	for (const item of planned.preparedNews) {
		if (item.action !== "create" || item.targetSlug === null) continue;
		const parentId = crypto.randomUUID();
		const parent: NewsRecord = {
			id: parentId,
			scopeId: state.scope.id,
			slug: item.targetSlug,
			createdAt: now,
			updatedAt: now,
			deletedAt: null,
			createdBy: actorLabel,
			updatedBy: actorLabel,
		};
		const translations: NewsTranslationRecord[] = item.translations.map((translation) => ({
			id: crypto.randomUUID(),
			newsId: parentId,
			lang: translation.lang,
			title: translation.title,
			summary: translation.summary,
			content: translation.content,
			contentType: translation.contentType,
			status: translation.status,
			publishedAt: translation.publishedAt,
			createdAt: now,
			updatedAt: now,
			deletedAt: null,
			createdBy: actorLabel,
			updatedBy: actorLabel,
		}));
		const articleTagIds = [
			...new Set(
				item.tagSlugs.flatMap((slug) => {
					const id = tagIds.get(slug);
					return id ? [id] : [];
				}),
			),
		];
		createdNews.push({ parent, translations, tagIds: articleTagIds });
	}

	const auditId = crypto.randomUUID();
	return {
		state,
		availableLanguages: planned.availableLanguages,
		tags: createdTags,
		reusedTags,
		skippedNews: planned.preparedNews.flatMap((item) => {
			if (item.action !== "skip" || item.targetNewsId === null) return [];
			const existing = state.news.find((candidate) => candidate.parent.id === item.targetNewsId);
			return existing ? [{ id: existing.parent.id, slug: existing.parent.slug }] : [];
		}),
		news: createdNews,
		createdAt: now,
		audit: {
			id: auditId,
			actorType: actor.type,
			actorId: actor.id,
			actorEmail: actor.email,
			actorLabel: actor.label,
			changes: {
				sourceScope: planned.sourceScope,
				targetScope: { year: state.scope.year, site: state.scope.site },
				createdNews: createdNews.length,
				skippedNews: planned.plan.summary.newsToSkip,
				createdTranslations: createdNews.reduce(
					(count, item) => count + item.translations.length,
					0,
				),
				createdTags: createdTags.length,
				addedLanguages: planned.plan.languagesToAdd,
			},
		},
	};
}
