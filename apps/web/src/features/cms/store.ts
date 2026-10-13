"use client";

import { atom } from "jotai";

import type { AdminNewsDto, NewsContentType, ScopeDto, ScopeRef, TagDto } from "@repo/core/types";

export interface NewsFormState {
	title: string;
	slug: string;
	summary: string;
	contentType: NewsContentType;
	content: string;
	tagIds: string[];
	publishedAt: string;
	lang: string;
}

export const selectedScopeAtom = atom<ScopeRef | null>(null);
export const availableScopesAtom = atom<ScopeDto[]>([]);
export const scopeLoadErrorAtom = atom<string | null>(null);
export const newsAtom = atom<AdminNewsDto[]>([]);
export const tagsAtom = atom<TagDto[]>([]);
export const searchTextAtom = atom("");
export const selectedTagSlugAtom = atom<string | null>(null);
export const selectedLangFilterAtom = atom<string | null>(null);
export const cmsPendingAtom = atom(false);
export const cmsErrorAtom = atom<string | null>(null);
export const newsFormAtom = atom<NewsFormState>({
	title: "",
	slug: "",
	summary: "",
	contentType: "markdown",
	content: "",
	tagIds: [],
	publishedAt: "",
	lang: "ja",
});
