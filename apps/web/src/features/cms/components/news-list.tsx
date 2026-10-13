import { Empty, LayerCard, LinkButton, Text } from "@cloudflare/kumo";
import { FilePlusIcon, SettingsIcon } from "lucide-react";

import { scopePath } from "#web/features/cms/site";
import type { AdminNewsPage, ScopeRef, TagDto } from "@repo/core/types";

import { NewsListControls } from "./news-list-controls";
import { NewsListTable } from "./news-list-table";

interface NewsListProps {
	scope: ScopeRef;
	scopeName: string;
	initialPage: AdminNewsPage;
	pageSize: number;
	tags: TagDto[];
	availableLanguages: string[];
	filters: {
		page: number;
		search: string;
		lang?: string | undefined;
		tag?: string | undefined;
	};
}

export function NewsList({
	scope,
	scopeName,
	initialPage,
	pageSize,
	tags,
	availableLanguages,
	filters,
}: NewsListProps) {
	const news = initialPage.items;
	const totalCount = initialPage.totalCount ?? 0;
	const hasActiveFilters = Boolean(filters.search || filters.tag || filters.lang);

	return (
		<section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
			<div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
				<div className="flex min-w-0 flex-col gap-2">
					<Text as="h1" variant="heading" size="lg">
						{scopeName}
					</Text>
					<Text variant="secondary" size="base">
						お知らせの公開状態を確認し、本文やタグを編集できます。
					</Text>
				</div>
				<div className="flex items-center gap-3">
					<LinkButton href={`${scopePath(scope)}/new`} variant="primary">
						<FilePlusIcon aria-hidden="true" className="size-4" />
						新しいお知らせ
					</LinkButton>
					<LinkButton href={`${scopePath(scope)}/settings`} variant="secondary">
						<SettingsIcon aria-hidden="true" className="size-4" />
						設定
					</LinkButton>
				</div>
			</div>

			<NewsListControls
				key={JSON.stringify([filters.page, filters.search, filters.lang, filters.tag])}
				availableLanguages={availableLanguages}
				lang={filters.lang}
				page={filters.page}
				pageSize={pageSize}
				scope={scope}
				search={filters.search}
				tag={filters.tag}
				tags={tags}
				totalCount={totalCount}
			>
				{news.length === 0 ? (
					<Empty
						className="px-4 py-12"
						description={
							filters.page > 1
								? "前のページに戻ってお試しください。"
								: !hasActiveFilters
									? "新しいお知らせを作成すると、ここに表示されます。"
									: "検索条件やタグを変更してお試しください。"
						}
						contents={
							filters.page === 1 && !hasActiveFilters ? (
								<LinkButton href={`${scopePath(scope)}/new`} variant="outline">
									<FilePlusIcon aria-hidden="true" className="size-4" />
									お知らせを作成
								</LinkButton>
							) : undefined
						}
						title="お知らせがありません"
					/>
				) : (
					<LayerCard className="p-0">
						<div className="overflow-x-auto">
							<NewsListTable news={news} scope={scope} />
						</div>
					</LayerCard>
				)}
			</NewsListControls>
		</section>
	);
}
