import type {
	DataExportScope,
	DataImportNewsDecision,
	DataImportPlan,
	DataImportTargetCurrent,
} from "#core/types";

export type ImportPlanTarget = Readonly<{
	scope: Readonly<{
		id: string;
		year: number;
		site: DataExportScope["site"];
		name: string;
		availableLanguages: readonly string[];
		defaultLanguage: string;
	}>;
	news: readonly Readonly<{
		id: string;
		slug: string;
		tags: readonly Readonly<{ id: string; name: string; slug: string }>[];
		translations: readonly Readonly<{
			id: string;
			lang: string;
			title: string;
			summary: string | null;
			contentType: "markdown" | "link";
			content: string;
			status: "draft" | "published";
			publishedAt: string | null;
		}>[];
	}>[];
	tags: readonly Readonly<{ id: string; name: string; slug: string }>[];
}>;

export type PreparedTranslation = {
	lang: string;
	title: string;
	summary: string | null;
	content: string;
	contentType: "markdown" | "link";
	status: "draft" | "published";
	publishedAt: Date | null;
};

export type PreparedTag = {
	sourceSlug: string;
	name: string;
	slug: string;
	action: "create" | "reuse";
	targetName: string;
	targetTagId: string | null;
};

export type PreparedNews = {
	newsIndex: number;
	sourceSlug: string;
	targetSlug: string | null;
	targetNewsId: string | null;
	action: "create" | "skip" | "unresolved";
	tagSlugs: string[];
	translations: PreparedTranslation[];
};

export type PlannedImport = {
	plan: DataImportPlan;
	sourceScope: DataExportScope;
	targetCurrent: DataImportTargetCurrent;
	preparedTags: PreparedTag[];
	preparedNews: PreparedNews[];
	availableLanguages: string[];
};

export type NormalizedSourceTag = {
	name: string;
	slug: string;
	valid: boolean;
};

export type NormalizedSourceTranslation = PreparedTranslation & { sourceLanguage: string | null };

export type NormalizedSourceNews = {
	index: number;
	slug: string;
	validSlug: boolean;
	tags: string[];
	translations: NormalizedSourceTranslation[];
};

export type NormalizedSource = {
	tags: NormalizedSourceTag[];
	news: NormalizedSourceNews[];
	errors: string[];
};

export type NewsSlugPlan = {
	newsIndex: number;
	sourceSlug: string;
	targetSlug: string | null;
	targetNewsId: string | null;
	isDuplicate: boolean;
	duplicateDecision: "skip" | "rename-auto" | "rename-manual" | null;
	action: "create" | "skip" | "unresolved";
};

export type NewsDecisionByIndex = ReadonlyMap<number, DataImportNewsDecision>;

export type LanguageResolution = {
	languageTargets: Map<string, string>;
	languagesToAdd: string[];
	languageMappings: DataImportPlan["languageMappings"];
	unresolvedLanguages: string[];
};
