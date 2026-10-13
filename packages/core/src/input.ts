import { z } from "zod";

import { CmsError } from "#core/errors";
import {
	createNewsInputSchema,
	createNewsTranslationInputSchema,
	createAssetInputSchema,
	createTagInputSchema,
	ensureScopeInputSchema,
	updateNewsInputSchema,
	updateNewsTranslationInputSchema,
	updateTagInputSchema,
	type CreateNewsInput,
	type CreateNewsTranslationInput,
	type CreateAssetInput,
	type CreateTagInput,
	type EnsureScopeInput,
	type ScopeRef,
	type UpdateNewsInput,
	type UpdateNewsTranslationInput,
	type UpdateTagInput,
} from "#core/types";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parseInput<T>(schema: z.ZodType<T>, input: unknown) {
	const parsed = schema.safeParse(input);
	if (!parsed.success) throw new CmsError("validation", "Input validation failed.");
	return parsed.data;
}

export function normalizeLang(value: string | undefined, defaultLang = "ja") {
	const candidate = (value === undefined ? defaultLang : value).trim();
	if (candidate.length === 0 || candidate.length > 35) {
		throw new CmsError("validation", "lang must be a valid BCP 47 language tag.");
	}
	try {
		const [canonical] = Intl.getCanonicalLocales(candidate);
		if (!canonical) throw new RangeError("Missing language tag");
		return canonical;
	} catch {
		throw new CmsError("validation", "lang must be a valid BCP 47 language tag.");
	}
}

export function canonicalizeStoredLanguage(value: string) {
	try {
		return Intl.getCanonicalLocales(value)[0] ?? null;
	} catch {
		return null;
	}
}

export function normalizeAvailableLanguages(languages: string[] | undefined) {
	if (languages === undefined) return undefined;
	const normalized = [...new Set(languages.map((lang) => normalizeLang(lang)))];
	if (normalized.length === 0) {
		throw new CmsError("validation", "availableLanguages must contain at least one language.");
	}
	return normalized;
}

export function normalizeScopeLanguages(
	availableLanguages: string[] | undefined,
	defaultLanguage: string | undefined,
) {
	const normalizedAvailable = normalizeAvailableLanguages(availableLanguages) ?? ["ja", "en"];
	const normalizedDefault = normalizeLang(defaultLanguage, normalizedAvailable[0] ?? "ja");
	if (!normalizedAvailable.includes(normalizedDefault)) {
		throw new CmsError("validation", "defaultLanguage must be included in availableLanguages.");
	}
	return { availableLanguages: normalizedAvailable, defaultLanguage: normalizedDefault };
}

export function normalizeScope(scope: ScopeRef): ScopeRef {
	if (!Number.isSafeInteger(scope.year) || scope.year < 1 || scope.year > 9999) {
		throw new CmsError("validation", "year must be an integer from 1 to 9999.");
	}
	return { year: scope.year, site: scope.site };
}

export function normalizeSlug(value: string, field = "slug") {
	const slug = value.trim().toLowerCase();
	if (slug.length === 0 || slug.length > 200 || !slugPattern.test(slug)) {
		throw new CmsError("validation", `${field} must be a lowercase kebab-case slug.`);
	}
	return slug;
}

function requiredText(value: string, field: string, maxLength: number) {
	const normalized = value.trim();
	if (normalized.length === 0 || normalized.length > maxLength) {
		throw new CmsError("validation", `${field} is required and has an invalid length.`);
	}
	return normalized;
}

function nullableText(value: string | null | undefined, field: string, maxLength: number) {
	if (value === undefined || value === null) return value ?? null;
	const normalized = value.trim();
	if (normalized.length > maxLength) {
		throw new CmsError("validation", `${field} exceeds the maximum length.`);
	}
	return normalized;
}

function nullablePublishedAt(value: string | null | undefined) {
	if (value === undefined) return undefined;
	if (value === null) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		throw new CmsError("validation", "publishedAt must be a valid ISO date.");
	}
	return date;
}

function normalizeTagIds(tagIds: string[] | undefined) {
	if (tagIds === undefined) return undefined;
	const normalized = [...new Set(tagIds.map((tagId) => tagId.trim()))];
	if (normalized.some((tagId) => tagId.length === 0)) {
		throw new CmsError("validation", "tagIds must contain non-empty IDs.");
	}
	return normalized;
}

export function normalizeCreateNewsInput(input: CreateNewsInput, defaultLang = "ja") {
	const parsed = parseInput(createNewsInputSchema, input);
	return {
		slug: normalizeSlug(parsed.slug),
		title: requiredText(parsed.title, "title", 200),
		summary: nullableText(parsed.summary, "summary", 2_000),
		content: parsed.content,
		contentType: parsed.contentType,
		tagIds: normalizeTagIds(parsed.tagIds) ?? [],
		publishedAt: nullablePublishedAt(parsed.publishedAt) ?? null,
		lang: normalizeLang(parsed.lang, defaultLang),
	};
}

export function normalizeUpdateNewsInput(input: UpdateNewsInput) {
	const parsed = parseInput(updateNewsInputSchema, input);
	const normalized: {
		slug?: string;
		title?: string;
		summary?: string | null;
		content?: string;
		contentType?: "markdown" | "link";
		tagIds?: string[];
		publishedAt?: Date | null;
		lang?: string;
	} = {};
	if (parsed.slug !== undefined) normalized.slug = normalizeSlug(parsed.slug);
	if (parsed.title !== undefined) normalized.title = requiredText(parsed.title, "title", 200);
	if (parsed.summary !== undefined)
		normalized.summary = nullableText(parsed.summary, "summary", 2_000);
	if ("contentType" in parsed) {
		normalized.content = parsed.content;
		normalized.contentType = parsed.contentType;
	}
	if (parsed.tagIds !== undefined) normalized.tagIds = normalizeTagIds(parsed.tagIds) ?? [];
	if (parsed.publishedAt !== undefined) {
		const publishedAt = nullablePublishedAt(parsed.publishedAt);
		if (publishedAt !== undefined) normalized.publishedAt = publishedAt;
	}
	if (parsed.lang !== undefined) normalized.lang = normalizeLang(parsed.lang);
	if (Object.keys(normalized).length === 0) {
		throw new CmsError("validation", "At least one news field is required.");
	}
	return normalized;
}

export function normalizeCreateNewsTranslationInput(input: CreateNewsTranslationInput) {
	const parsed = parseInput(createNewsTranslationInputSchema, input);
	return {
		title: requiredText(parsed.title, "title", 200),
		summary: nullableText(parsed.summary, "summary", 2_000),
		content: parsed.content,
		contentType: parsed.contentType,
		publishedAt: nullablePublishedAt(parsed.publishedAt) ?? null,
	};
}

export function normalizeUpdateNewsTranslationInput(input: UpdateNewsTranslationInput) {
	const parsed = parseInput(updateNewsTranslationInputSchema, input);
	const normalized: {
		title: string;
		summary?: string | null;
		content?: string;
		contentType?: "markdown" | "link";
		publishedAt?: Date | null;
	} = {
		title: requiredText(parsed.title, "title", 200),
	};
	if (parsed.summary !== undefined)
		normalized.summary = nullableText(parsed.summary, "summary", 2_000);
	if ("contentType" in parsed) {
		normalized.content = parsed.content;
		normalized.contentType = parsed.contentType;
	}
	if (parsed.publishedAt !== undefined) {
		const publishedAt = nullablePublishedAt(parsed.publishedAt);
		if (publishedAt !== undefined) normalized.publishedAt = publishedAt;
	}
	return normalized;
}

export function normalizeCreateTagInput(input: CreateTagInput) {
	const parsed = parseInput(createTagInputSchema, input);
	return {
		name: requiredText(parsed.name, "name", 200),
		slug: normalizeSlug(parsed.slug),
	};
}

export function normalizeUpdateTagInput(input: UpdateTagInput) {
	const parsed = parseInput(updateTagInputSchema, input);
	const normalized: { name?: string; slug?: string } = {};
	if (parsed.name !== undefined) normalized.name = requiredText(parsed.name, "name", 200);
	if (parsed.slug !== undefined) normalized.slug = normalizeSlug(parsed.slug);
	if (Object.keys(normalized).length === 0) {
		throw new CmsError("validation", "At least one tag field is required.");
	}
	return normalized;
}

export function normalizeCreateAssetInput(input: CreateAssetInput) {
	const parsed = parseInput(createAssetInputSchema, input);
	const objectKey = requiredText(parsed.objectKey, "objectKey", 1_024);
	const filename = requiredText(parsed.filename, "filename", 255);
	const mimeType = requiredText(parsed.mimeType, "mimeType", 255);
	if (!Number.isSafeInteger(parsed.size) || parsed.size < 0) {
		throw new CmsError("validation", "size must be a non-negative safe integer.");
	}
	return { objectKey, filename, mimeType, size: parsed.size };
}

export function normalizeEnsureScopeInput(input: EnsureScopeInput) {
	const parsed = parseInput(ensureScopeInputSchema, input);
	const availableLanguages = normalizeAvailableLanguages(parsed.availableLanguages);
	return {
		name: parsed.name === undefined ? undefined : requiredText(parsed.name, "name", 200),
		availableLanguages,
		defaultLanguage:
			parsed.defaultLanguage === undefined ? undefined : normalizeLang(parsed.defaultLanguage),
	};
}

export function normalizeLimit(limit: number | undefined) {
	if (limit === undefined) return 20;
	if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
		throw new CmsError("validation", "limit must be an integer from 1 to 100.");
	}
	return limit;
}
