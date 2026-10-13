import type { DataImportPlan } from "#core/types";

import type {
	NewsSlugPlan,
	NormalizedSourceNews,
	PreparedNews,
	PreparedTranslation,
} from "./types";
import { addError } from "./utils";

export function assembleNewsPlan(
	sourceNews: NormalizedSourceNews[],
	slugPlans: NewsSlugPlan[],
	languageTargets: Map<string, string>,
	targetLanguages: Set<string>,
	errors: string[],
) {
	const preparedNews: PreparedNews[] = [];
	const planNews: DataImportPlan["news"] = [];
	for (const item of sourceNews) {
		const allocation = slugPlans[item.index];
		if (!allocation) continue;
		const plannedTranslations: DataImportPlan["news"][number]["translations"] = [];
		const preparedTranslations: PreparedTranslation[] = [];
		const seenTargetLanguages = new Set<string>();
		for (const translation of item.translations) {
			const targetLanguage = resolveTranslationTargetLanguage(
				allocation,
				translation.sourceLanguage,
				languageTargets,
				targetLanguages,
			);
			if (targetLanguage && seenTargetLanguages.has(targetLanguage)) {
				addError(
					errors,
					`お知らせ「${item.slug}」の複数の翻訳が同じ取り込み先言語「${targetLanguage}」になります。`,
				);
			}
			if (targetLanguage) seenTargetLanguages.add(targetLanguage);
			plannedTranslations.push({
				sourceLanguage: translation.sourceLanguage ?? translation.lang,
				targetLanguage,
				title: translation.title,
				contentType: translation.contentType,
				status: translation.status,
				publishedAt: translation.publishedAt?.toISOString() ?? null,
			});
			if (targetLanguage) preparedTranslations.push({ ...translation, lang: targetLanguage });
		}
		preparedNews.push({
			newsIndex: item.index,
			sourceSlug: item.slug,
			targetSlug: allocation.targetSlug,
			targetNewsId: allocation.targetNewsId,
			action: allocation.action,
			tagSlugs: [...item.tags],
			translations: preparedTranslations,
		});
		planNews.push({
			newsIndex: item.index,
			sourceSlug: item.slug,
			targetNewsId: allocation.targetNewsId,
			isDuplicate: allocation.isDuplicate,
			duplicateDecision: allocation.duplicateDecision,
			action: allocation.action,
			targetSlug: allocation.targetSlug,
			translations: plannedTranslations,
		});
	}
	return { preparedNews, planNews };
}

function resolveTranslationTargetLanguage(
	newsPlan: NewsSlugPlan,
	sourceLanguage: string | null,
	languageTargets: Map<string, string>,
	targetLanguages: Set<string>,
) {
	if (newsPlan.action === "skip" || sourceLanguage === null) return null;
	return (
		languageTargets.get(sourceLanguage) ??
		(targetLanguages.has(sourceLanguage) ? sourceLanguage : null)
	);
}
