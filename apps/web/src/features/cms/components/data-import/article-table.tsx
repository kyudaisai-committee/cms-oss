"use client";

import { Badge, Button, Table, Text } from "@cloudflare/kumo";

import type { ScopeDataExport } from "@repo/core/types";
import type { DataImportPlan } from "@repo/core/types";

import type { DataImportReadonly } from "../../data-import-model";
import { getDataImportDisplayTranslations } from "../../data-import/display";

interface DataImportArticleTableProps {
	source: DataImportReadonly<ScopeDataExport>;
	plan: DataImportPlan;
	onSelectArticle: (newsIndex: number) => void;
}

function getArticleTitle(
	news: DataImportReadonly<ScopeDataExport>["news"][number],
	defaultLanguage: string,
) {
	return (
		getDataImportDisplayTranslations(news.translations, defaultLanguage)[0]?.translation.title ||
		"無題のお知らせ"
	);
}

function getArticleLanguages(
	news: DataImportReadonly<ScopeDataExport>["news"][number],
	plannedNews: DataImportPlan["news"][number],
	defaultLanguage: string,
) {
	return getDataImportDisplayTranslations(news.translations, defaultLanguage)
		.map(({ translation, sourceIndex }) => {
			const plannedTranslation = plannedNews.translations[sourceIndex];
			const sourceLanguage = plannedTranslation?.sourceLanguage ?? translation.lang;
			if (plannedNews.action === "skip") return sourceLanguage;
			if (!plannedTranslation?.targetLanguage) return `${sourceLanguage} → 選択が必要`;
			return plannedTranslation.targetLanguage === sourceLanguage
				? sourceLanguage
				: `${sourceLanguage} → ${plannedTranslation.targetLanguage}`;
		})
		.join(", ");
}

function getArticleStatuses(
	news: DataImportReadonly<ScopeDataExport>["news"][number],
	defaultLanguage: string,
) {
	const now = Date.now();
	const statuses = new Set(
		getDataImportDisplayTranslations(news.translations, defaultLanguage).map(({ translation }) => {
			if (translation.status === "draft") return "下書き";
			return translation.publishedAt && new Date(translation.publishedAt).getTime() > now
				? "公開予定"
				: "公開中";
		}),
	);
	return [...statuses].join("・") || "翻訳なし";
}

function getActionLabel(item: DataImportPlan["news"][number]) {
	if (item.action === "skip") return "スキップ";
	if (item.action === "unresolved") return "選択が必要";
	if (item.duplicateDecision === "rename-auto") return "連番で追加";
	if (item.duplicateDecision === "rename-manual") return "指定slugで追加";
	return "新規追加";
}

function getActionVariant(item: DataImportPlan["news"][number]) {
	if (item.action === "skip") return "secondary" as const;
	if (item.action === "unresolved") return "warning" as const;
	return "success" as const;
}

export function DataImportArticleTable({
	source,
	plan,
	onSelectArticle,
}: DataImportArticleTableProps) {
	return (
		<div
			aria-label="取り込み記事のプレビューを左右にスクロール"
			className="max-w-full overflow-x-auto"
			role="region"
			tabIndex={0}
		>
			<Table aria-label="取り込み記事のプレビュー" className="min-w-[56rem]">
				<Table.Header>
					<Table.Row>
						<Table.Head>記事</Table.Head>
						<Table.Head>元slug</Table.Head>
						<Table.Head>取り込みslug</Table.Head>
						<Table.Head>翻訳</Table.Head>
						<Table.Head>公開状態</Table.Head>
						<Table.Head>処理</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{source.news.map((news, newsIndex) => {
						const item = plan.news[newsIndex];
						if (!item) return null;
						return (
							<Table.Row key={`${newsIndex}-${news.slug}`}>
								<Table.Cell>
									<Button
										aria-haspopup="dialog"
										aria-label={`${getArticleTitle(news, source.scope.defaultLanguage)} の取り込み詳細を開く`}
										onClick={() => onSelectArticle(newsIndex)}
										type="button"
										variant="ghost"
										className="p-0 underline *:font-medium hover:bg-[unset]"
									>
										{getArticleTitle(news, source.scope.defaultLanguage)}
									</Button>
									{item.isDuplicate ? (
										<Text as="p" variant="secondary" size="base">
											既存slugと重複
										</Text>
									) : null}
								</Table.Cell>
								<Table.Cell>{news.slug}</Table.Cell>
								<Table.Cell>{item.targetSlug ?? "—"}</Table.Cell>
								<Table.Cell>
									{getArticleLanguages(news, item, source.scope.defaultLanguage) || "—"}
								</Table.Cell>
								<Table.Cell>{getArticleStatuses(news, source.scope.defaultLanguage)}</Table.Cell>
								<Table.Cell>
									<Badge variant={getActionVariant(item)}>{getActionLabel(item)}</Badge>
								</Table.Cell>
							</Table.Row>
						);
					})}
				</Table.Body>
			</Table>
		</div>
	);
}
