import { scopePath } from "#web/features/cms/site";
import type { ScopeRef } from "@repo/core/types";

type NewsListHref = ReturnType<typeof scopePath> | `${ReturnType<typeof scopePath>}?${string}`;

export interface NewsListQuery {
	page: number;
	search: string;
	lang?: string | undefined;
	tag?: string | undefined;
}

export function parseNewsListQuery(params: URLSearchParams): NewsListQuery {
	const requestedPage = Number(params.get("page"));
	const lang = params.get("lang")?.trim() || undefined;
	const tag = params.get("tag")?.trim() || undefined;
	return {
		page: Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
		search: params.get("search")?.trim().slice(0, 200) ?? "",
		...(lang ? { lang } : {}),
		...(tag ? { tag } : {}),
	};
}

export function buildNewsListHref(scope: ScopeRef, query: NewsListQuery): NewsListHref {
	const params = new URLSearchParams();
	if (query.search.trim()) params.set("search", query.search.trim());
	if (query.lang) params.set("lang", query.lang);
	if (query.tag) params.set("tag", query.tag);
	if (query.page > 1) params.set("page", String(query.page));
	const search = params.toString();
	return `${scopePath(scope)}${search ? `?${search}` : ""}`;
}
