import { Suspense } from "react";
import type { PageProps } from "waku/router";

import { NewsListSkeleton } from "#web/components/cms-loading-skeleton";
import { CmsShell } from "#web/components/cms-shell";
import { DocumentTitle } from "#web/components/document-title";
import { StatusMessage } from "#web/components/status-message";
import { NewsList } from "#web/features/cms/components/news-list";
import { ScopeDataProvider } from "#web/features/cms/components/scope-data-provider";
import { TagManager } from "#web/features/cms/components/tag-manager";
import { parseNewsListQuery, type NewsListQuery } from "#web/features/cms/news-list-query";
import { getScope, listAdminNews, listTags } from "#web/lib/cms/read.server";
import { scopeRefSchema, type ScopeRef } from "@repo/core/types";

interface NewsListPageProps extends PageProps<"/[year]/[site]"> {}

const newsPageSize = 10;

export default async function NewsListPage({ year, site, query }: NewsListPageProps) {
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
	const filters = parseNewsListQuery(new URLSearchParams(query));
	const boundaryKey = JSON.stringify(filters);
	return (
		<CmsShell year={scope.year} site={scope.site}>
			<Suspense key={boundaryKey} fallback={<NewsListSkeleton />}>
				<NewsListContent filters={filters} scope={scope} />
			</Suspense>
		</CmsShell>
	);
}

async function NewsListContent({ scope, filters }: { scope: ScopeRef; filters: NewsListQuery }) {
	try {
		const [page, tags, scopeDto] = await Promise.all([
			listAdminNews(scope, {
				lang: filters.lang,
				limit: newsPageSize,
				page: filters.page,
				search: filters.search || undefined,
				tagSlug: filters.tag,
			}),
			listTags(scope),
			getScope(scope),
		]);
		return (
			<>
				<NewsList
					availableLanguages={scopeDto.availableLanguages}
					filters={filters}
					initialPage={page}
					pageSize={newsPageSize}
					scope={scope}
					scopeName={scopeDto.name}
					tags={tags}
				/>
				<DocumentTitle title={scopeDto.name} />
				<ScopeDataProvider news={[]} scope={scope} tags={tags}>
					<div className="mx-auto w-full max-w-7xl px-4 pb-10 sm:px-6">
						<TagManager initialTags={tags} scope={scope} />
					</div>
				</ScopeDataProvider>
			</>
		);
	} catch {
		return (
			<section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
				<StatusMessage tone="error">
					お知らせを読み込めませんでした。しばらくしてから再度お試しください。
				</StatusMessage>
			</section>
		);
	}
}

export async function getConfig() {
	return { render: "dynamic" } as const;
}
