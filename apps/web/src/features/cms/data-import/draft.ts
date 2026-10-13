import { normalizeLang } from "@repo/core/input";
import type {
	DataImportLanguageDecision,
	DataImportNewsDecision,
	DataImportRequest,
	ScopeDataExport,
} from "@repo/core/types";

import { cloneDataImportSource } from "./source";
import type { DataImportReadonly } from "./source";

export type DataImportNewsChoice =
	| Readonly<{ newsIndex: number; action: "skip" }>
	| Readonly<{ newsIndex: number; action: "rename"; mode: "auto" }>
	| Readonly<{ newsIndex: number; action: "rename"; mode: "manual"; targetSlug: string }>;

export type DataImportLanguageChoice = Readonly<{
	sourceLanguage: string;
	action: "add" | "map";
	targetLanguage: string | null;
}>;

export type DataImportNewsAction = "skip" | "auto" | "manual" | null;
export type DataImportLanguageAction = "" | "add" | "map";

export type DataImportEditingDraft = Readonly<{
	id: number;
	originalIndex: number;
	source: DataImportReadonly<ScopeDataExport>;
	newsChoices: readonly DataImportNewsChoice[];
	languageChoices: readonly DataImportLanguageChoice[];
}>;

export type DataImportServerApproval = Readonly<{
	requestFingerprint: string;
	previewToken: string;
}>;

export function createDataImportDraft(
	source: DataImportReadonly<ScopeDataExport>,
	originalIndex: number,
	id: number,
): DataImportEditingDraft {
	return {
		id,
		originalIndex,
		source: cloneDataImportSource(source),
		newsChoices: [],
		languageChoices: [],
	};
}

export function buildDataImportRequest(draft: DataImportEditingDraft): DataImportRequest {
	const languageDecisions: DataImportLanguageDecision[] = [];
	for (const choice of draft.languageChoices) {
		if (choice.action === "add") {
			languageDecisions.push({ sourceLanguage: choice.sourceLanguage, action: "add" });
			continue;
		}
		const targetLanguage = choice.targetLanguage?.trim();
		if (targetLanguage)
			languageDecisions.push({
				sourceLanguage: choice.sourceLanguage,
				action: "map",
				targetLanguage,
			});
	}
	const newsDecisions: DataImportNewsDecision[] = draft.newsChoices.map((choice) => {
		if (choice.action === "skip") return choice;
		if (choice.mode === "auto") return choice;
		return { ...choice, targetSlug: choice.targetSlug };
	});
	return {
		source: structuredClone(draft.source) as ScopeDataExport,
		newsDecisions,
		languageDecisions,
	};
}

export function getDataImportRequestFingerprint(request: DataImportRequest): string {
	return JSON.stringify(request);
}

export function isDataImportCommitReady(
	planReady: boolean,
	approval: DataImportServerApproval | null,
	request: DataImportRequest,
): boolean {
	return Boolean(
		planReady &&
		approval &&
		approval.requestFingerprint === getDataImportRequestFingerprint(request),
	);
}

export function updateDataImportNewsChoice(
	draft: DataImportEditingDraft,
	newsIndex: number,
	choice: DataImportNewsChoice | null,
): DataImportEditingDraft {
	const newsChoices = draft.newsChoices.filter((item) => item.newsIndex !== newsIndex);
	if (choice) newsChoices.push(choice);
	return { ...draft, newsChoices };
}

export function updateDataImportManualSlug(
	draft: DataImportEditingDraft,
	newsIndex: number,
	targetSlug: string,
): DataImportEditingDraft {
	const current = draft.newsChoices.find((item) => item.newsIndex === newsIndex);
	if (!current || current.action !== "rename" || current.mode !== "manual") return draft;
	return updateDataImportNewsChoice(draft, newsIndex, { ...current, targetSlug });
}

export function updateDataImportLanguageChoice(
	draft: DataImportEditingDraft,
	choice: DataImportLanguageChoice | null,
	sourceLanguage: string,
): DataImportEditingDraft {
	const languageChoices = draft.languageChoices.filter(
		(item) => item.sourceLanguage !== sourceLanguage,
	);
	if (choice) languageChoices.push(choice);
	return { ...draft, languageChoices };
}

export function reconcileDataImportLanguageChoices(
	draft: DataImportEditingDraft,
	targetLanguages: readonly string[],
): DataImportEditingDraft {
	const availableLanguages = new Set(
		targetLanguages.flatMap((language) => {
			try {
				return [normalizeLang(language)];
			} catch {
				return [];
			}
		}),
	);
	const requiredLanguages = new Set<string>();
	for (const [newsIndex, news] of draft.source.news.entries()) {
		if (
			draft.newsChoices.some((choice) => choice.newsIndex === newsIndex && choice.action === "skip")
		)
			continue;
		for (const translation of news.translations) {
			try {
				const language = normalizeLang(translation.lang);
				if (!availableLanguages.has(language)) requiredLanguages.add(language);
			} catch {
				continue;
			}
		}
	}
	const languageChoices = draft.languageChoices.flatMap((choice) => {
		let sourceLanguage: string;
		try {
			sourceLanguage = normalizeLang(choice.sourceLanguage);
		} catch {
			return [];
		}
		if (!requiredLanguages.has(sourceLanguage)) return [];
		if (choice.action === "add")
			return sourceLanguage === choice.sourceLanguage ? [choice] : [{ ...choice, sourceLanguage }];
		if (!choice.targetLanguage) return [{ ...choice, sourceLanguage, targetLanguage: "" }];
		try {
			const targetLanguage = normalizeLang(choice.targetLanguage);
			return availableLanguages.has(targetLanguage)
				? [{ ...choice, sourceLanguage, targetLanguage }]
				: [{ ...choice, sourceLanguage, targetLanguage: "" }];
		} catch {
			return [{ ...choice, sourceLanguage, targetLanguage: "" }];
		}
	});
	if (
		languageChoices.length === draft.languageChoices.length &&
		languageChoices.every((choice, index) => {
			const current = draft.languageChoices[index];
			return (
				current?.sourceLanguage === choice.sourceLanguage &&
				current.action === choice.action &&
				current.targetLanguage === choice.targetLanguage
			);
		})
	)
		return draft;
	return { ...draft, languageChoices };
}

export function applyDataImportNewsAction(
	draft: DataImportEditingDraft,
	newsIndex: number,
	action: DataImportNewsAction,
	targetLanguages: readonly string[],
): DataImportEditingDraft {
	let next: DataImportEditingDraft;
	if (action === null) next = updateDataImportNewsChoice(draft, newsIndex, null);
	else if (action === "skip")
		next = updateDataImportNewsChoice(draft, newsIndex, { newsIndex, action });
	else if (action === "auto")
		next = updateDataImportNewsChoice(draft, newsIndex, {
			newsIndex,
			action: "rename",
			mode: "auto",
		});
	else {
		const existing = draft.newsChoices.find((choice) => choice.newsIndex === newsIndex);
		next = updateDataImportNewsChoice(draft, newsIndex, {
			newsIndex,
			action: "rename",
			mode: "manual",
			targetSlug:
				existing?.action === "rename" && existing.mode === "manual" ? existing.targetSlug : "",
		});
	}
	return reconcileDataImportLanguageChoices(next, targetLanguages);
}

export function applyDataImportLanguageAction(
	draft: DataImportEditingDraft,
	sourceLanguage: string,
	action: DataImportLanguageAction,
): DataImportEditingDraft {
	if (action === "") return updateDataImportLanguageChoice(draft, null, sourceLanguage);
	if (action === "add")
		return updateDataImportLanguageChoice(
			draft,
			{ sourceLanguage, action, targetLanguage: null },
			sourceLanguage,
		);
	return updateDataImportLanguageChoice(
		draft,
		{
			sourceLanguage,
			action,
			targetLanguage:
				draft.languageChoices.find((choice) => choice.sourceLanguage === sourceLanguage)
					?.targetLanguage ?? "",
		},
		sourceLanguage,
	);
}

export function applyDataImportLanguageTarget(
	draft: DataImportEditingDraft,
	sourceLanguage: string,
	targetLanguage: string,
): DataImportEditingDraft {
	return updateDataImportLanguageChoice(
		draft,
		{ sourceLanguage, action: "map", targetLanguage },
		sourceLanguage,
	);
}
