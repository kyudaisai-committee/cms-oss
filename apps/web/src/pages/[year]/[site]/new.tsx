import { Suspense } from "react";
import type { PageProps } from "waku/router";

import { NewsFormSkeleton } from "#web/components/cms-loading-skeleton";
import { CmsShell } from "#web/components/cms-shell";
import { DocumentTitle } from "#web/components/document-title";
import { StatusMessage } from "#web/components/status-message";
import { NewsForm } from "#web/features/cms/components/news-form";
import { getScope, listTags } from "#web/lib/cms/read.server";
import { scopeRefSchema, type ScopeRef } from "@repo/core/types";

interface NewNewsPageProps extends PageProps<"/[year]/[site]/new"> {}

export default async function NewNewsPage({ year, site, query }: NewNewsPageProps) {
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
	const initialSlug = searchParams.get("slug") ?? undefined;
	const initialLang = searchParams.get("lang") ?? undefined;

	return (
		<CmsShell pageTitle="新規作成" site={scope.site} year={scope.year}>
			<Suspense fallback={<NewsFormSkeleton />}>
				<NewNewsContent initialLang={initialLang} initialSlug={initialSlug} scope={scope} />
			</Suspense>
		</CmsShell>
	);
}

async function NewNewsContent({
	scope,
	initialSlug,
	initialLang,
}: {
	scope: ScopeRef;
	initialSlug?: string | undefined;
	initialLang?: string | undefined;
}) {
	try {
		const [tags, scopeDto] = await Promise.all([listTags(scope), getScope(scope)]);
		return (
			<>
				<DocumentTitle title={`${scopeDto.name} | 新しいお知らせ`} />
				<NewsForm
					key={`${initialSlug ?? "new"}:${initialLang ?? "default"}`}
					availableLanguages={scopeDto.availableLanguages}
					defaultLanguage={scopeDto.defaultLanguage}
					initialLang={initialLang}
					initialSlug={initialSlug}
					scope={scope}
					scopeName={scopeDto.name}
					tags={tags}
				/>
			</>
		);
	} catch {
		return (
			<section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
				<StatusMessage tone="error">
					タグを読み込めませんでした。しばらくしてから再度お試しください。
				</StatusMessage>
			</section>
		);
	}
}

export async function getConfig() {
	return { render: "dynamic" } as const;
}
