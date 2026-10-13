import { Suspense } from "react";
import type { PageProps } from "waku/router";

import { NewsFormSkeleton } from "#web/components/cms-loading-skeleton";
import { CmsShell } from "#web/components/cms-shell";
import { DocumentTitle } from "#web/components/document-title";
import { StatusMessage } from "#web/components/status-message";
import { NewsForm } from "#web/features/cms/components/news-form";
import { getAdminNews, getScope, listTags } from "#web/lib/cms/read.server";
import { CmsError } from "@repo/core/errors";
import { canonicalizeStoredLanguage } from "@repo/core/input";
import { scopeRefSchema, type ScopeRef } from "@repo/core/types";

interface EditNewsPageProps extends PageProps<"/[year]/[site]/[id]"> {}

export default async function EditNewsPage({ year, site, id, query }: EditNewsPageProps) {
	const parsed = scopeRefSchema.safeParse({ year, site });
	if (!parsed.success) {
		return (
			<CmsShell>
				<section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
					<StatusMessage tone="error">指定された年度またはサイトは利用できません。</StatusMessage>
				</section>
			</CmsShell>
		);
	}
	const scope: ScopeRef = parsed.data;
	const searchParams = new URLSearchParams(query);
	const lang = searchParams.get("lang") ?? undefined;
	return (
		<CmsShell year={scope.year} site={scope.site} pageTitle="お知らせ編集">
			<Suspense
				fallback={
					<>
						<DocumentTitle title="お知らせを編集" />
						<NewsFormSkeleton />
					</>
				}
			>
				<EditNewsContent id={id} lang={lang} scope={scope} />
			</Suspense>
		</CmsShell>
	);
}

async function getAdminNewsForEdit(scope: ScopeRef, id: string, requestedLang?: string) {
	if (requestedLang === undefined) return getAdminNews(scope, id);
	try {
		return await getAdminNews(scope, id, requestedLang);
	} catch (error) {
		if (!(error instanceof CmsError) || error.code !== "not_found") throw error;
		return getAdminNews(scope, id);
	}
}

async function EditNewsContent({
	id,
	lang,
	scope,
}: {
	id: string;
	lang?: string | undefined;
	scope: ScopeRef;
}) {
	try {
		const requestedLang = lang ? (canonicalizeStoredLanguage(lang) ?? undefined) : undefined;
		if (lang && !requestedLang) throw new Error("Invalid language.");
		const [news, tags, scopeDto] = await Promise.all([
			getAdminNewsForEdit(scope, id, requestedLang),
			listTags(scope),
			getScope(scope),
		]);
		if (
			requestedLang &&
			!scopeDto.availableLanguages.some(
				(available) => canonicalizeStoredLanguage(available) === requestedLang,
			)
		)
			throw new Error("Language is not available.");
		const translationMissing =
			requestedLang !== undefined &&
			!news.translations?.some(
				(translation) => canonicalizeStoredLanguage(translation.lang) === requestedLang,
			);
		return (
			<>
				<DocumentTitle title={`${scopeDto.name} | ${news.title || "お知らせを編集"}`} />
				<NewsForm
					key={`${news.id}:${requestedLang ?? news.lang}`}
					availableLanguages={scopeDto.availableLanguages}
					defaultLanguage={scopeDto.defaultLanguage}
					news={news}
					scope={scope}
					scopeName={scopeDto.name}
					tags={tags}
					initialLang={requestedLang}
					translationMissing={translationMissing}
				/>
			</>
		);
	} catch {
		return (
			<section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
				<StatusMessage tone="error">
					お知らせを読み込めませんでした。URLと権限を確認してください。
				</StatusMessage>
			</section>
		);
	}
}

export async function getConfig() {
	return { render: "dynamic" } as const;
}
