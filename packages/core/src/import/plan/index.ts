import { canonicalizeStoredLanguage } from "#core/input";
import { dataImportPlanSchema } from "#core/types";
import type { DataImportRequest } from "#core/types";

import { allocateNewsSlugs, planSourceTags, resolveLanguages } from "./choices";
import { assembleNewsPlan } from "./news";
import { normalizeSource } from "./source";
import { summarizeImportPlan } from "./summary";
import { buildTargetCurrent, normalizeTargetIndex } from "./target";
import type { ImportPlanTarget, PlannedImport } from "./types";
import { addError } from "./utils";

export function planDataImport(
	request: DataImportRequest,
	target: ImportPlanTarget,
): PlannedImport {
	const source = normalizeSource(request.source);
	const errors = source.errors;
	const targetCurrent = buildTargetCurrent(target);
	const targetIndex = normalizeTargetIndex(target, errors);
	const tags = planSourceTags(source.tags, target.tags, errors);
	const slugs = allocateNewsSlugs(
		source.news,
		targetIndex.newsBySlug,
		targetIndex.occupiedSlugs,
		request,
		errors,
	);
	const languages = resolveLanguages(
		source.news,
		slugs.plans,
		targetIndex.targetLanguages,
		request.languageDecisions,
		errors,
	);
	const news = assembleNewsPlan(
		source.news,
		slugs.plans,
		languages.languageTargets,
		targetIndex.targetLanguages,
		errors,
	);

	for (const tag of tags) {
		if (tag.action === "reuse" && tag.targetTagId === null)
			addError(errors, `取り込み先タグ「${tag.slug}」の参照先を特定できません。`);
	}
	const availableLanguages = [...target.scope.availableLanguages];
	for (const language of languages.languagesToAdd) {
		if (!availableLanguages.some((current) => canonicalizeStoredLanguage(current) === language))
			availableLanguages.push(language);
	}
	const ready =
		errors.length === 0 &&
		languages.unresolvedLanguages.length === 0 &&
		slugs.unresolvedNewsIndexes.length === 0 &&
		news.planNews.every(
			(item) =>
				item.action === "skip" ||
				(item.action === "create" &&
					item.targetSlug !== null &&
					item.translations.every((translation) => translation.targetLanguage !== null)),
		);
	const plan = dataImportPlanSchema.parse({
		news: news.planNews,
		tags: tags.map(({ sourceSlug, name, action, targetName }) => ({
			sourceSlug,
			sourceName: name,
			action,
			targetName,
		})),
		languagesToAdd: languages.languagesToAdd,
		languageMappings: languages.languageMappings,
		unresolvedLanguages: languages.unresolvedLanguages,
		unresolvedNewsIndexes: slugs.unresolvedNewsIndexes,
		errors,
		ready,
		summary: summarizeImportPlan(news.planNews, tags, languages.languagesToAdd),
	});
	return {
		plan,
		sourceScope: { ...request.source.scope },
		targetCurrent,
		preparedTags: tags,
		preparedNews: news.preparedNews,
		availableLanguages,
	};
}
