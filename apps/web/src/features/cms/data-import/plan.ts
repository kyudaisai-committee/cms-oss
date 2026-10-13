import { planDataImport } from "@repo/core/import-plan";
import type { ImportPlanTarget, PlannedImport } from "@repo/core/import-plan";
import type { DataImportPlan } from "@repo/core/types";

import { buildDataImportRequest } from "./draft";
import type { DataImportEditingDraft } from "./draft";

export function planDataImportDraft(
	draft: DataImportEditingDraft,
	targetCurrent: ImportPlanTarget,
): PlannedImport {
	return planDataImport(buildDataImportRequest(draft), targetCurrent);
}

export function getDataImportDuplicateIndexes(plan: DataImportPlan): number[] {
	return plan.news.filter((item) => item.isDuplicate).map((item) => item.newsIndex);
}

export function getDataImportLanguageIndexes(plan: DataImportPlan): string[] {
	const languages = new Set([
		...plan.unresolvedLanguages,
		...plan.languagesToAdd,
		...plan.languageMappings.map((mapping) => mapping.sourceLanguage),
	]);
	return [...languages].sort((left, right) => left.localeCompare(right));
}
