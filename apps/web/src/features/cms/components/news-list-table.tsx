"use client";

import { Badge, Link, LinkButton, Table, Text } from "@cloudflare/kumo";
import { tz } from "@date-fns/tz";
import { format, isValid, parseISO } from "date-fns";
import { PencilIcon } from "lucide-react";

import { scopePath } from "#web/features/cms/site";
import type { AdminNewsDto, ScopeRef } from "@repo/core/types";

interface NewsListTableProps {
	news: AdminNewsDto[];
	scope: ScopeRef;
}

const japanTimeZoneContext = tz("Asia/Tokyo");

function getLanguageLabel(lang: string) {
	try {
		return new Intl.DisplayNames(["ja"], { type: "language" }).of(lang) ?? lang;
	} catch {
		return lang;
	}
}

const statusLabels = {
	draft: "下書き",
	unpublished: "非公開",
	scheduled: "公開予定",
	published: "公開中",
} as const;

type DisplayStatus = keyof typeof statusLabels;

function getDisplayStatus(news: AdminNewsDto): DisplayStatus {
	if (news.status !== "published") return "draft";
	if (news.publishedAt && new Date(news.publishedAt).getTime() > Date.now()) {
		return "scheduled";
	}
	return "published";
}

function statusVariant(status: DisplayStatus) {
	if (status === "published") return "success" as const;
	if (status === "scheduled") return "warning" as const;
	return "secondary" as const;
}

function formatDate(value: string) {
	const date = parseISO(value);
	return isValid(date)
		? format(date, "yyyy/MM/dd HH:mm", { in: japanTimeZoneContext })
		: "日時不明";
}

export function NewsListTable({ news, scope }: NewsListTableProps) {
	return (
		<Table aria-label="お知らせ一覧" className="min-w-4xl" layout="fixed">
			<colgroup>
				<col />
				<col className="w-20" />
				<col className="w-40" />
				<col />
				<col className="w-40" />
				<col className="w-24" />
			</colgroup>
			<Table.Header>
				<Table.Row>
					<Table.Head>タイトル</Table.Head>
					<Table.Head className="whitespace-nowrap">言語</Table.Head>
					<Table.Head className="whitespace-nowrap">状態</Table.Head>
					<Table.Head>タグ</Table.Head>
					<Table.Head className="text-right whitespace-nowrap">更新日時</Table.Head>
					<Table.Head className="text-right whitespace-nowrap">
						<span className="sr-only">操作</span>
					</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{news.map((item) => (
					<Table.Row key={item.id}>
						<Table.Cell>
							<div className="flex flex-wrap items-center gap-2">
								<Link
									className="font-medium"
									href={`${scopePath(scope)}/${encodeURIComponent(item.id)}`}
									variant="current"
								>
									{item.title || "無題のお知らせ"}
								</Link>
								{item.contentType === "link" ? <Badge variant="outline">リンク</Badge> : null}
							</div>
							<Text as="p" variant="secondary" size="base">
								{item.slug}
							</Text>
						</Table.Cell>
						<Table.Cell className="whitespace-nowrap">
							<div className="flex flex-wrap gap-1">
								{(
									item.translations ?? [
										{
											id: item.id,
											lang: item.lang,
											title: item.title,
											status: item.status,
											publishedAt: item.publishedAt,
										},
									]
								).map((translation) => (
									<Badge key={translation.id} variant="secondary">
										{getLanguageLabel(translation.lang)}
									</Badge>
								))}
							</div>
						</Table.Cell>
						<Table.Cell className="whitespace-nowrap">
							<div className="flex flex-wrap gap-1">
								{(
									item.translations ?? [
										{
											id: item.id,
											lang: item.lang,
											title: item.title,
											status: item.status,
											publishedAt: item.publishedAt,
										},
									]
								).map((translation) => {
									const translationStatus = getDisplayStatus({
										...item,
										lang: translation.lang,
										status: translation.status,
										publishedAt: translation.publishedAt,
									});
									return (
										<Badge key={translation.id} variant={statusVariant(translationStatus)}>
											{getLanguageLabel(translation.lang)}: {statusLabels[translationStatus]}
										</Badge>
									);
								})}
							</div>
						</Table.Cell>
						<Table.Cell>
							<div className="flex flex-wrap gap-1">
								{item.tags.length === 0 ? (
									<Text variant="secondary" size="base">
										—
									</Text>
								) : (
									item.tags.map((tagItem) => (
										<Badge key={tagItem.id} variant="outline">
											{tagItem.name}
										</Badge>
									))
								)}
							</div>
						</Table.Cell>
						<Table.Cell className="text-right whitespace-nowrap">
							<time dateTime={item.updatedAt}>
								<Text as="span" variant="secondary" size="base">
									{formatDate(item.updatedAt)}
								</Text>
							</time>
						</Table.Cell>
						<Table.Cell className="text-right whitespace-nowrap">
							<LinkButton
								href={`${scopePath(scope)}/${encodeURIComponent(item.id)}`}
								size="sm"
								variant="secondary"
							>
								<PencilIcon aria-hidden="true" className="size-3.5" />
								編集
							</LinkButton>
						</Table.Cell>
					</Table.Row>
				))}
			</Table.Body>
		</Table>
	);
}
