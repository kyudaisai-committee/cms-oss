"use client";

import { Button, Input, LayerCard, Pagination, Select } from "@cloudflare/kumo";
import { useState, type ReactNode, type SubmitEvent } from "react";
import { useRouter } from "waku";

import type { ScopeRef, TagDto } from "@repo/core/types";

import { buildNewsListHref } from "../news-list-query";

interface NewsListControlsProps {
	children: ReactNode;
	scope: ScopeRef;
	page: number;
	pageSize: number;
	totalCount: number;
	search: string;
	lang?: string | undefined;
	tag?: string | undefined;
	tags: TagDto[];
	availableLanguages: string[];
}

function getLanguageLabel(lang: string) {
	try {
		return new Intl.DisplayNames(["ja"], { type: "language" }).of(lang) ?? lang;
	} catch {
		return lang;
	}
}

export function NewsListControls({
	children,
	scope,
	page,
	pageSize,
	totalCount,
	search: initialSearch,
	lang: initialLang,
	tag: initialTag,
	tags,
	availableLanguages,
}: NewsListControlsProps) {
	const router = useRouter();
	const [search, setSearch] = useState(initialSearch);
	const [lang, setLang] = useState(initialLang ?? "");
	const [tag, setTag] = useState(initialTag ?? "");

	const pushQuery = (updates: {
		search?: string;
		lang?: string | null;
		tag?: string | null;
		page?: number;
	}) => {
		const nextSearch = updates.search ?? search;
		const nextLang = "lang" in updates ? updates.lang : lang;
		const nextTag = "tag" in updates ? updates.tag : tag;
		const nextPage = updates.page ?? 1;
		const href = buildNewsListHref(scope, {
			lang: nextLang ?? undefined,
			page: nextPage,
			search: nextSearch,
			tag: nextTag ?? undefined,
		});
		void router.push(href, {
			unstable_instant: true,
		});
	};

	const submitSearch = (event: SubmitEvent<HTMLFormElement>) => {
		event.preventDefault();
		pushQuery({ search, page: 1 });
	};

	return (
		<>
			<LayerCard className="mb-5 p-4">
				<form
					className="grid items-end gap-3 md:grid-cols-[minmax(0,1fr)_12rem_12rem_auto]"
					onSubmit={submitSearch}
				>
					<Input
						autoComplete="off"
						aria-label="お知らせを検索"
						label="検索"
						maxLength={200}
						placeholder="タイトル、slug、概要"
						value={search}
						onChange={(event) => setSearch(event.target.value)}
					/>
					<Select
						aria-label="言語で絞り込む"
						label="言語"
						onValueChange={(value) => {
							const selected = typeof value === "string" && value ? value : "";
							setLang(selected);
							pushQuery({ lang: selected || null, page: 1 });
						}}
						placeholder="すべての言語"
						value={lang}
					>
						<Select.Option value="">すべての言語</Select.Option>
						{availableLanguages.map((language) => (
							<Select.Option key={language} value={language}>
								{getLanguageLabel(language)}
							</Select.Option>
						))}
					</Select>
					<Select
						aria-label="タグで絞り込む"
						label="タグ"
						onValueChange={(value) => {
							const selected = typeof value === "string" && value ? value : "";
							setTag(selected);
							pushQuery({ tag: selected || null, page: 1 });
						}}
						placeholder="すべてのタグ"
						value={tag}
					>
						<Select.Option value="">すべてのタグ</Select.Option>
						{tags.map((item) => (
							<Select.Option key={item.id} value={item.slug}>
								{item.name}
							</Select.Option>
						))}
					</Select>
					<Button type="submit" variant="secondary">
						検索
					</Button>
				</form>
			</LayerCard>

			{children}

			{page > 1 || totalCount > pageSize ? (
				<div className="mt-4">
					<Pagination
						labels={{
							navigation: "お知らせのページ",
							previousPage: "前のページ",
							nextPage: "次のページ",
							firstPage: "最初のページ",
							lastPage: "最後のページ",
							pageNumber: "ページ番号",
							pageSize: "1ページの件数",
						}}
						page={page}
						perPage={pageSize}
						setPage={(nextPage) => pushQuery({ page: nextPage })}
						totalCount={totalCount}
					>
						<div aria-atomic="true" aria-live="polite" className="grow">
							<Pagination.Info>{({ page }) => `ページ ${page}`}</Pagination.Info>
						</div>
						<Pagination.Controls />
					</Pagination>
				</div>
			) : null}
		</>
	);
}
