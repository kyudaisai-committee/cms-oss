import { canonicalizeStoredLanguage } from "#core/input";
import { dataImportTargetCurrentSchema, type DataImportTargetCurrent } from "#core/types";

import type { ImportPlanTarget } from "./types";
import { normalizeOrReport } from "./utils";

function buildTargetCurrent(target: ImportPlanTarget): DataImportTargetCurrent {
	return dataImportTargetCurrentSchema.parse({
		scope: {
			id: target.scope.id,
			year: target.scope.year,
			site: target.scope.site,
			name: target.scope.name,
			availableLanguages: [...target.scope.availableLanguages],
			defaultLanguage: target.scope.defaultLanguage,
		},
		news: target.news.map((item) => ({
			id: item.id,
			slug: item.slug,
			tags: item.tags.map((tag) => ({ ...tag })),
			translations: item.translations.map((translation) => ({ ...translation })),
		})),
		tags: target.tags.map(({ id, name, slug }) => ({ id, name, slug })),
	});
}

function normalizeTargetIndex(target: ImportPlanTarget, errors: string[]) {
	const targetLanguages = new Set(
		target.scope.availableLanguages
			.map(canonicalizeStoredLanguage)
			.filter((language): language is string => language !== null),
	);
	const newsBySlug = new Map<string, ImportPlanTarget["news"][number]>();
	const occupiedSlugs = new Set<string>();
	for (const item of target.news) {
		const slug = normalizeOrReport(item.slug, errors, "取り込み先のお知らせ");
		if (slug === null) continue;
		occupiedSlugs.add(slug);
		if (!newsBySlug.has(slug)) newsBySlug.set(slug, item);
	}
	return { targetLanguages, newsBySlug, occupiedSlugs };
}

export { buildTargetCurrent, normalizeTargetIndex };
