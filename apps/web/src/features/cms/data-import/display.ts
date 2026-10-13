export interface DataImportDisplayTranslation<T> {
	translation: T;
	sourceIndex: number;
}

export function getDataImportDisplayTranslations<T extends { lang: string }>(
	translations: readonly T[],
	defaultLanguage: string,
): DataImportDisplayTranslation<T>[] {
	const entries = translations.map((translation, sourceIndex) => ({ translation, sourceIndex }));
	const defaultEntry = entries.find((entry) => entry.translation.lang === defaultLanguage);

	if (!defaultEntry || defaultEntry.sourceIndex === 0) return entries;
	return [defaultEntry, ...entries.filter((entry) => entry !== defaultEntry)];
}
