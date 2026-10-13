import { z } from "zod";

import { cmsSettings } from "#web/cms-settings";
import { newsContentTypeSchema } from "@repo/core/types";
import type { ScopeRef } from "@repo/core/types";

import type { NewsFormState } from "../store";

export const NEWS_FORM_DRAFT_VERSION = 3;

const newsFormStateSchema = z
	.object({
		title: z.string(),
		slug: z.string(),
		summary: z.string(),
		contentType: newsContentTypeSchema,
		content: z.string(),
		tagIds: z.array(z.string()),
		publishedAt: z.string(),
		lang: z.string(),
	})
	.strict();

const storedNewsFormSchema = z
	.object({
		version: z.literal(NEWS_FORM_DRAFT_VERSION),
		state: newsFormStateSchema,
		baseFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
	})
	.strict();

export interface NewsFormDraft {
	state: NewsFormState;
	baseFingerprint: string;
}

export interface NewsFormDraftStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

function getLocalStorage(): NewsFormDraftStorage | null {
	try {
		if (typeof window === "undefined") return null;
		return window.localStorage;
	} catch {
		return null;
	}
}

function resolveStorage(
	storage: NewsFormDraftStorage | null | undefined,
): NewsFormDraftStorage | null {
	return storage === undefined ? getLocalStorage() : storage;
}

export function getNewsFormDraftStorageKey(scope: ScopeRef, newsId?: string): string {
	return getNewsFormDraftStorageKeyForLanguage(scope, newsId, "ja");
}

export function getNewsFormDraftStorageKeyForLanguage(
	scope: ScopeRef,
	newsId: string | undefined,
	lang: string,
): string {
	const identifier = newsId === undefined ? "new" : `id:${encodeURIComponent(newsId)}`;
	return `${cmsSettings.newsFormStoragePrefix}:v${NEWS_FORM_DRAFT_VERSION}:${scope.year}:${scope.site}:${identifier}:lang:${encodeURIComponent(lang)}`;
}

export function getLegacyNewsFormDraftStorageKey(scope: ScopeRef, newsId?: string): string {
	const identifier = newsId === undefined ? "new" : `id:${encodeURIComponent(newsId)}`;
	return `${cmsSettings.newsFormStoragePrefix}:v${NEWS_FORM_DRAFT_VERSION}:${scope.year}:${scope.site}:${identifier}`;
}

export function normalizeNewsFormState(state: NewsFormState): NewsFormState {
	return {
		title: state.title,
		slug: state.slug,
		summary: state.summary,
		contentType: state.contentType,
		content: state.content,
		tagIds: [...state.tagIds].sort(),
		publishedAt: state.publishedAt,
		lang: state.lang,
	};
}

export function serializeNewsFormState(state: NewsFormState): string {
	return JSON.stringify(normalizeNewsFormState(state));
}

export function areNewsFormStatesEqual(left: NewsFormState, right: NewsFormState): boolean {
	return serializeNewsFormState(left) === serializeNewsFormState(right);
}

export async function sha256Hex(value: string): Promise<string | null> {
	try {
		const subtle = globalThis.crypto?.subtle;
		if (!subtle) return null;
		const digest = await subtle.digest("SHA-256", new TextEncoder().encode(value));
		return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
			"",
		);
	} catch {
		return null;
	}
}

export function getNewsFormFingerprint(state: NewsFormState): Promise<string | null> {
	return sha256Hex(serializeNewsFormState(state));
}

export function readNewsFormDraft(
	key: string,
	storage?: NewsFormDraftStorage | null,
): NewsFormDraft | null {
	const target = resolveStorage(storage);
	if (!target) return null;
	try {
		const rawValue = target.getItem(key);
		if (!rawValue) return null;
		const parsed = storedNewsFormSchema.safeParse(JSON.parse(rawValue));
		return parsed.success
			? { baseFingerprint: parsed.data.baseFingerprint, state: parsed.data.state }
			: null;
	} catch {
		return null;
	}
}

export function writeNewsFormDraft(
	key: string,
	state: NewsFormState,
	baseFingerprint: string,
	storage?: NewsFormDraftStorage | null,
): void {
	const target = resolveStorage(storage);
	if (!target) return;
	try {
		target.setItem(
			key,
			JSON.stringify({ baseFingerprint, state, version: NEWS_FORM_DRAFT_VERSION }),
		);
	} catch {
		// Storage can be unavailable or full in private browsing and restricted documents.
	}
}

export function removeNewsFormDraft(key: string, storage?: NewsFormDraftStorage | null): void {
	const target = resolveStorage(storage);
	if (!target) return;
	try {
		target.removeItem(key);
	} catch {
		// Storage can be unavailable in private browsing and restricted documents.
	}
}

export function persistNewsFormDraft(
	key: string,
	state: NewsFormState,
	baseState: NewsFormState,
	storage?: NewsFormDraftStorage | null,
	signal?: AbortSignal,
): Promise<boolean> {
	if (signal?.aborted) return Promise.resolve(false);
	if (areNewsFormStatesEqual(state, baseState)) {
		removeNewsFormDraft(key, storage);
		return Promise.resolve(true);
	}
	return getNewsFormFingerprint(baseState).then((baseFingerprint) => {
		if (!baseFingerprint || signal?.aborted) return false;
		writeNewsFormDraft(key, state, baseFingerprint, storage);
		return false;
	});
}
