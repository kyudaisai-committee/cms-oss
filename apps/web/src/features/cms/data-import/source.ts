import {
	dataExportSchema,
	type DataExport,
	type DataImportTargetCurrent,
	type ScopeDataExport,
} from "@repo/core/types";

export type DataImportReadonly<T> = T extends (infer U)[]
	? readonly DataImportReadonly<U>[]
	: T extends object
		? { readonly [K in keyof T]: DataImportReadonly<T[K]> }
		: T;

export type DataImportParseError =
	| "invalid-json"
	| "empty"
	| "unsupported-version"
	| "invalid-data";

export type DataImportParseResult =
	| { success: true; original: DataImportOriginal }
	| { success: false; error: DataImportParseError };

export type DataImportOriginal = Readonly<{
	rawText: string;
	entries: DataImportReadonly<DataExport>;
}>;

export type DataImportSourceSummary = Readonly<{
	articleCount: number;
	tagCount: number;
	translationCount: number;
}>;

function freezeDeep<T>(value: T): DataImportReadonly<T> {
	if (value === null || typeof value !== "object" || Object.isFrozen(value))
		return value as DataImportReadonly<T>;
	Object.freeze(value);
	for (const child of Object.values(value)) freezeDeep(child);
	return value as DataImportReadonly<T>;
}

function hasUnsupportedVersion(value: unknown): boolean {
	return (
		Array.isArray(value) &&
		value.some(
			(entry) =>
				typeof entry === "object" && entry !== null && "version" in entry && entry.version !== 1,
		)
	);
}

export function cloneDataImportSource(
	source: DataImportReadonly<ScopeDataExport>,
): DataImportReadonly<ScopeDataExport> {
	return freezeDeep(structuredClone(source));
}

export function parseDataImportText(text: string): DataImportParseResult {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		return { success: false, error: "invalid-json" };
	}
	if (Array.isArray(value) && value.length === 0) return { success: false, error: "empty" };
	const parsed = dataExportSchema.safeParse(value);
	if (!parsed.success) {
		return {
			success: false,
			error: hasUnsupportedVersion(value) ? "unsupported-version" : "invalid-data",
		};
	}
	return {
		success: true,
		original: freezeDeep({ rawText: text, entries: parsed.data }),
	};
}

export function getDataImportErrorMessage(error: DataImportParseError): string {
	switch (error) {
		case "invalid-json":
			return "JSONを読み取れませんでした。正しいJSONファイルを選択してください。";
		case "empty":
			return "JSON配列に読み取れるスコープデータがありません。";
		case "unsupported-version":
			return "対応していないversionです。version 1のエクスポートファイルを選択してください。";
		case "invalid-data":
			return "JSONの形式またはデータ内容がエクスポート形式と一致しません。";
	}
}

export function getDataImportSourceOptionValue(index: number): string {
	return String(index);
}

export function getDataImportSourceOptionLabel(
	source: DataImportReadonly<ScopeDataExport>,
	index: number,
): string {
	return `元データ ${index + 1}: ${source.scope.name}（${source.scope.year} · ${source.scope.site}）`;
}

export function getDataImportSource(
	original: DataImportOriginal,
	indexValue: string,
): DataImportReadonly<ScopeDataExport> | undefined {
	const index = Number(indexValue);
	if (!Number.isSafeInteger(index) || index < 0 || String(index) !== indexValue) return undefined;
	return original.entries[index];
}

export function getDataImportSourceSummary(
	source: ScopeDataExport | DataImportReadonly<ScopeDataExport>,
): DataImportSourceSummary {
	return {
		articleCount: source.news.length,
		tagCount: source.tags.length,
		translationCount: source.news.reduce(
			(count, article) => count + article.translations.length,
			0,
		),
	};
}

export function snapshotDataImportTarget(
	target: DataImportReadonly<DataImportTargetCurrent>,
): DataImportReadonly<DataImportTargetCurrent> {
	return freezeDeep(structuredClone(target));
}
