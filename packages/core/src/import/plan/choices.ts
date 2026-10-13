import type {
	DataImportLanguageDecision,
	DataImportNewsDecision,
	DataImportPlan,
	DataImportRequest,
} from "#core/types";

import type {
	ImportPlanTarget,
	LanguageResolution,
	NewsSlugPlan,
	NormalizedSourceNews,
	NormalizedSourceTag,
	PreparedTag,
} from "./types";
import { normalizeLanguageOrReport, normalizeOrReport, addError } from "./utils";

function planSourceTags(
	sourceTags: NormalizedSourceTag[],
	targetTags: ImportPlanTarget["tags"],
	errors: string[],
): PreparedTag[] {
	return sourceTags.map((sourceTag) => {
		const normalizedSlug = sourceTag.valid
			? sourceTag.slug
			: normalizeOrReport(sourceTag.slug, errors, `タグ「${sourceTag.name}」`);
		const matchingBySlug = normalizedSlug
			? targetTags.find(
					(tag) => normalizeOrReport(tag.slug, errors, "取り込み先のタグ") === normalizedSlug,
				)
			: undefined;
		const matchingTag =
			matchingBySlug ?? targetTags.find((tag) => tag.name.trim() === sourceTag.name.trim());
		return {
			sourceSlug: normalizedSlug ?? sourceTag.slug,
			name: sourceTag.name,
			slug: normalizedSlug ?? sourceTag.slug,
			action: matchingTag ? "reuse" : "create",
			targetName: matchingTag?.name ?? sourceTag.name,
			targetTagId: matchingTag?.id ?? null,
		};
	});
}

function autoRenameSlug(sourceSlug: string, suffix: number) {
	const suffixText = `-${suffix}`;
	const prefix = sourceSlug.slice(0, 200 - suffixText.length).replace(/-+$/u, "");
	return `${prefix}${suffixText}`;
}

function allocateNewsSlugs(
	news: NormalizedSourceNews[],
	targetNewsBySlug: Map<string, ImportPlanTarget["news"][number]>,
	occupiedSlugs: Set<string>,
	request: DataImportRequest,
	errors: string[],
) {
	const decisionsByIndex = new Map<number, DataImportNewsDecision>();
	for (const decision of request.newsDecisions) {
		if (decision.newsIndex >= news.length) {
			addError(errors, "重複時の選択対象に存在しないお知らせが指定されています。");
			continue;
		}
		if (decisionsByIndex.has(decision.newsIndex)) {
			addError(errors, "同じお知らせに複数の重複時の扱いが指定されています。");
			continue;
		}
		decisionsByIndex.set(decision.newsIndex, decision);
	}
	const manualTargetsByIndex = new Map<number, string>();
	for (const [index, decision] of decisionsByIndex) {
		if (decision.action !== "rename" || decision.mode !== "manual" || !decision.targetSlug)
			continue;
		const targetSlug = normalizeOrReport(
			decision.targetSlug,
			errors,
			`変更後slug（${index + 1}件目）`,
		);
		if (targetSlug) manualTargetsByIndex.set(index, targetSlug);
	}
	const reservedManualSlugs = new Set(manualTargetsByIndex.values());

	const reservedSlugs = new Set(occupiedSlugs);
	for (const item of news) if (item.validSlug) reservedSlugs.add(item.slug);
	const assignedSlugs = new Set<string>();
	const unresolvedNewsIndexes: number[] = [];
	const plans: NewsSlugPlan[] = [];
	for (const item of news) {
		const existing = item.validSlug ? targetNewsBySlug.get(item.slug) : undefined;
		const decision = decisionsByIndex.get(item.index);
		if (!existing && decision)
			addError(
				errors,
				`お知らせ「${item.slug}」は重複していないため、重複時の扱いは指定できません。`,
			);
		const duplicateDecision = existing
			? decision?.action === "skip"
				? "skip"
				: decision?.action === "rename"
					? decision.mode === "auto"
						? "rename-auto"
						: "rename-manual"
					: null
			: null;
		let action: NewsSlugPlan["action"] = item.validSlug ? "create" : "unresolved";
		let targetSlug: string | null = item.validSlug ? item.slug : null;
		if (existing && decision?.action === "skip") {
			action = "skip";
			targetSlug = null;
		} else if (existing && decision?.action === "rename" && decision.mode === "manual") {
			const manualSlug = manualTargetsByIndex.get(item.index) ?? null;
			if (manualSlug === null) {
				action = "unresolved";
				unresolvedNewsIndexes.push(item.index);
			} else if (reservedSlugs.has(manualSlug) || assignedSlugs.has(manualSlug)) {
				action = "unresolved";
				addError(
					errors,
					`変更後slug「${manualSlug}」は取り込み先または他のお知らせと重複しています。`,
				);
			} else {
				targetSlug = manualSlug;
				assignedSlugs.add(manualSlug);
			}
		} else if (existing && decision?.action === "rename" && decision.mode === "auto") {
			let suffix = 2;
			let candidate = autoRenameSlug(item.slug, suffix);
			while (
				reservedSlugs.has(candidate) ||
				reservedManualSlugs.has(candidate) ||
				assignedSlugs.has(candidate)
			) {
				suffix += 1;
				candidate = autoRenameSlug(item.slug, suffix);
			}
			targetSlug = candidate;
			assignedSlugs.add(candidate);
		} else if (existing) {
			action = "unresolved";
			targetSlug = null;
			unresolvedNewsIndexes.push(item.index);
		} else if (action === "create" && targetSlug !== null) {
			assignedSlugs.add(targetSlug);
		}
		plans.push({
			newsIndex: item.index,
			sourceSlug: item.slug,
			targetSlug,
			targetNewsId: existing?.id ?? null,
			isDuplicate: existing !== undefined,
			duplicateDecision,
			action,
		});
	}
	return { plans, unresolvedNewsIndexes };
}

function resolveLanguages(
	news: NormalizedSourceNews[],
	newsSlugPlans: NewsSlugPlan[],
	targetLanguages: Set<string>,
	decisions: DataImportLanguageDecision[],
	errors: string[],
): LanguageResolution {
	const createIndexes = new Set(
		newsSlugPlans.filter((item) => item.action !== "skip").map((item) => item.newsIndex),
	);
	const requiredLanguages = new Set<string>();
	for (const item of news) {
		if (!createIndexes.has(item.index)) continue;
		for (const translation of item.translations) {
			if (translation.sourceLanguage && !targetLanguages.has(translation.sourceLanguage))
				requiredLanguages.add(translation.sourceLanguage);
		}
	}

	const decisionsByLanguage = new Map<string, DataImportLanguageDecision>();
	for (const decision of decisions) {
		const sourceLanguage = normalizeLanguageOrReport(
			decision.sourceLanguage,
			errors,
			"選択した言語",
		);
		if (!sourceLanguage) continue;
		if (decisionsByLanguage.has(sourceLanguage)) {
			addError(errors, `言語「${sourceLanguage}」に複数の取り込み方法が指定されています。`);
			continue;
		}
		decisionsByLanguage.set(
			sourceLanguage,
			decision.action === "add"
				? { sourceLanguage, action: "add" }
				: { sourceLanguage, action: "map", targetLanguage: decision.targetLanguage },
		);
		if (!requiredLanguages.has(sourceLanguage))
			addError(
				errors,
				`言語「${sourceLanguage}」の取り込み方法は現在の取り込み対象ではありません。`,
			);
	}

	const languageTargets = new Map<string, string>();
	const languagesToAdd: string[] = [];
	const languageMappings: DataImportPlan["languageMappings"] = [];
	const unresolvedLanguages: string[] = [];
	for (const language of requiredLanguages) {
		const decision = decisionsByLanguage.get(language);
		if (!decision) {
			unresolvedLanguages.push(language);
			continue;
		}
		if (decision.action === "add") {
			languageTargets.set(language, language);
			languagesToAdd.push(language);
			continue;
		}
		const targetLanguage = normalizeLanguageOrReport(
			decision.targetLanguage,
			errors,
			`言語「${language}」の変更先`,
		);
		if (!targetLanguage) {
			unresolvedLanguages.push(language);
			continue;
		}
		if (!targetLanguages.has(targetLanguage)) {
			addError(errors, `変更先の言語「${targetLanguage}」は取り込み先で利用できません。`);
			unresolvedLanguages.push(language);
			continue;
		}
		languageTargets.set(language, targetLanguage);
		languageMappings.push({ sourceLanguage: language, targetLanguage });
	}
	return { languageTargets, languagesToAdd, languageMappings, unresolvedLanguages };
}

export { allocateNewsSlugs, planSourceTags, resolveLanguages };
