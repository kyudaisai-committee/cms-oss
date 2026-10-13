import { normalizeCreateNewsTranslationInput, normalizeCreateTagInput } from "#core/input";
import type { ScopeDataExport } from "#core/types";

import type {
	NormalizedSource,
	NormalizedSourceNews,
	NormalizedSourceTag,
	NormalizedSourceTranslation,
} from "./types";
import { addError, normalizeLanguageOrReport, normalizeOrReport } from "./utils";

function normalizeSource(source: ScopeDataExport): NormalizedSource {
	const errors: string[] = [];
	const tags: NormalizedSourceTag[] = [];
	const tagsBySlug = new Map<string, NormalizedSourceTag>();
	const seenTagNames = new Set<string>();
	for (const sourceTag of source.tags) {
		let normalized: ReturnType<typeof normalizeCreateTagInput> | null = null;
		try {
			normalized = normalizeCreateTagInput(sourceTag);
		} catch {
			addError(errors, `タグ「${sourceTag.name}」の名前またはslugが不正です。`);
		}
		const slug = normalized?.slug ?? sourceTag.slug;
		const name = normalized?.name ?? sourceTag.name;
		if (normalized && tagsBySlug.has(normalized.slug)) {
			addError(errors, `元データに同じslugのタグ「${normalized.slug}」が複数あります。`);
			continue;
		}
		if (normalized && seenTagNames.has(normalized.name)) {
			addError(errors, `元データに同じ名前のタグ「${normalized.name}」が複数あります。`);
			continue;
		}
		const entry = { name, slug, valid: normalized !== null };
		tags.push(entry);
		if (normalized) {
			tagsBySlug.set(normalized.slug, entry);
			seenTagNames.add(normalized.name);
		}
	}

	const news: NormalizedSourceNews[] = [];
	const seenNewsSlugs = new Set<string>();
	for (const [index, sourceNews] of source.news.entries()) {
		const normalizedSlug = normalizeOrReport(
			sourceNews.slug,
			errors,
			`元データのお知らせ ${index + 1}`,
		);
		if (normalizedSlug && seenNewsSlugs.has(normalizedSlug))
			addError(errors, `元データに同じslugのお知らせ「${normalizedSlug}」が複数あります。`);
		if (normalizedSlug) seenNewsSlugs.add(normalizedSlug);

		const articleTags: string[] = [];
		const seenArticleTags = new Set<string>();
		for (const sourceTagSlug of sourceNews.tags) {
			const tagSlug = normalizeOrReport(
				sourceTagSlug,
				errors,
				`お知らせ「${sourceNews.slug}」のタグ参照`,
			);
			const sourceTag = tagSlug ? tagsBySlug.get(tagSlug) : undefined;
			if (tagSlug === null || !sourceTag || !sourceTag.valid) {
				addError(errors, `お知らせ「${sourceNews.slug}」が元データにないタグを参照しています。`);
				continue;
			}
			if (seenArticleTags.has(tagSlug)) {
				addError(errors, `お知らせ「${sourceNews.slug}」に同じタグが複数指定されています。`);
				continue;
			}
			seenArticleTags.add(tagSlug);
			articleTags.push(tagSlug);
		}

		if (sourceNews.translations.length === 0)
			addError(errors, `お知らせ「${sourceNews.slug}」に翻訳がありません。`);
		const translations: NormalizedSourceTranslation[] = [];
		const seenLanguages = new Set<string>();
		for (const sourceTranslation of sourceNews.translations) {
			const sourceLanguage = normalizeLanguageOrReport(
				sourceTranslation.lang,
				errors,
				`お知らせ「${sourceNews.slug}」の翻訳`,
			);
			if (sourceLanguage && seenLanguages.has(sourceLanguage))
				addError(errors, `お知らせ「${sourceNews.slug}」に同じ言語の翻訳が複数あります。`);
			if (sourceLanguage) seenLanguages.add(sourceLanguage);
			try {
				const normalized = normalizeCreateNewsTranslationInput(sourceTranslation);
				translations.push({
					...normalized,
					lang: sourceLanguage ?? sourceTranslation.lang,
					sourceLanguage,
					status: sourceTranslation.status,
				});
			} catch {
				addError(errors, `お知らせ「${sourceNews.slug}」の翻訳内容に不正な値があります。`);
				translations.push({
					lang: sourceLanguage ?? sourceTranslation.lang,
					sourceLanguage,
					title: sourceTranslation.title,
					summary: sourceTranslation.summary,
					content: sourceTranslation.content,
					contentType: sourceTranslation.contentType,
					status: sourceTranslation.status,
					publishedAt: sourceTranslation.publishedAt
						? new Date(sourceTranslation.publishedAt)
						: null,
				});
			}
		}
		news.push({
			index,
			slug: normalizedSlug ?? sourceNews.slug,
			validSlug: normalizedSlug !== null,
			tags: articleTags,
			translations,
		});
	}
	return { tags, news, errors };
}

export { normalizeSource };
