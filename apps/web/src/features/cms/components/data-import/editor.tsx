"use client";

import { Badge, Select, Text } from "@cloudflare/kumo";
import { useEffect, useState } from "react";

import type { DataImportPlan, DataImportTargetCurrent } from "@repo/core/types";

import type { DataImportEditingDraft, DataImportReadonly } from "../../data-import-model";
import {
	getDataImportDuplicateIndexes,
	getDataImportLanguageIndexes,
	planDataImportDraft,
} from "../../data-import/plan";
import { DataImportArticleTable } from "./article-table";
import { DataImportDetailsDialog } from "./details-dialog";

interface DataImportEditorProps {
	draft: DataImportEditingDraft;
	targetCurrent: DataImportReadonly<DataImportTargetCurrent> | null;
	disabled: boolean;
	onNewsDecisionChange: (newsIndex: number, action: "skip" | "auto" | "manual" | null) => void;
	onManualSlugChange: (newsIndex: number, slug: string) => void;
	onLanguageActionChange: (sourceLanguage: string, action: "" | "add" | "map") => void;
	onLanguageTargetChange: (sourceLanguage: string, targetLanguage: string) => void;
}

function countSourceStatuses(draft: DataImportEditingDraft) {
	let published = 0;
	let drafts = 0;
	let withPublicationDate = 0;
	for (const news of draft.source.news) {
		for (const translation of news.translations) {
			if (translation.status === "published") published += 1;
			else drafts += 1;
			if (translation.publishedAt !== null) withPublicationDate += 1;
		}
	}
	return { published, drafts, withPublicationDate };
}

function getLanguageLabel(language: string) {
	try {
		const name = new Intl.DisplayNames(["ja"], { type: "language" }).of(language);
		return name ? `${name}（${language}）` : language;
	} catch {
		return language;
	}
}

function renderLanguageAction(value: string) {
	if (value === "add") return "利用可能な言語に追加";
	if (value === "map") return "既存言語へ変更";
	return "未選択";
}

function renderTargetLanguage(value: string) {
	return value ? getLanguageLabel(value) : "変更先を選択";
}

function ImportPlanSummary({ plan }: { plan: DataImportPlan }) {
	const summary = plan.summary;
	return (
		<div className="grid gap-2">
			<div className="flex flex-wrap gap-2" aria-label="取り込み件数">
				<Badge variant="success">新規 {summary.newsToCreate}件</Badge>
				<Badge variant="secondary">スキップ {summary.newsToSkip}件</Badge>
				{plan.unresolvedNewsIndexes.length > 0 ? (
					<Badge variant="warning">選択が必要 {plan.unresolvedNewsIndexes.length}件</Badge>
				) : null}
				<Badge variant="secondary">翻訳 {summary.translationsToCreate}件</Badge>
			</div>
			<Text variant="secondary" size="base">
				タグ 新規 {summary.tagsToCreate}件・再利用 {summary.tagsToReuse}件・追加言語{" "}
				{summary.languagesToAdd}件
			</Text>
			{plan.errors.map((error, index) => (
				<Text key={`${index}-${error}`} role="alert" variant="secondary" size="base">
					{error}
				</Text>
			))}
		</div>
	);
}

export function DataImportEditor({
	draft,
	targetCurrent,
	disabled,
	onNewsDecisionChange,
	onManualSlugChange,
	onLanguageActionChange,
	onLanguageTargetChange,
}: DataImportEditorProps) {
	const [selectedNewsIndex, setSelectedNewsIndex] = useState<number | null>(null);
	useEffect(() => setSelectedNewsIndex(null), [draft.id]);
	const localPlan = targetCurrent ? planDataImportDraft(draft, targetCurrent) : null;
	const plan = localPlan?.plan ?? null;
	const duplicateIndexes = plan ? getDataImportDuplicateIndexes(plan) : [];
	const languageIndexes = plan ? getDataImportLanguageIndexes(plan) : [];
	const availableLanguages = targetCurrent?.scope.availableLanguages ?? [];
	const statuses = countSourceStatuses(draft);
	const selectedLanguageChoices = new Map(
		draft.languageChoices.map((choice) => [choice.sourceLanguage, choice]),
	);

	return (
		<div className="grid gap-4">
			<div className="grid gap-1">
				<Text as="h2" variant="heading" size="lg">
					取り込み内容を確認
				</Text>
				<Text variant="secondary" size="base">
					原本の公開状態・公開日時を保持します。画像ファイルは含まれず、本文中のURLはそのまま残ります。
				</Text>
				<Text variant="secondary" size="base">
					原本: 公開 {statuses.published}件・下書き {statuses.drafts}件・公開日時あり{" "}
					{statuses.withPublicationDate}件
				</Text>
			</div>

			{plan ? (
				<>
					<DataImportArticleTable
						source={draft.source}
						plan={plan}
						onSelectArticle={setSelectedNewsIndex}
					/>
					{duplicateIndexes.length > 0 ? (
						<Text variant="secondary" size="base">
							重複した記事の行を開き、記事ごとに扱いを選んでください。
						</Text>
					) : null}
					{languageIndexes.length > 0 ? (
						<div className="grid gap-3">
							<Text as="h2" variant="heading" size="lg">
								未登録言語の取り込み方法
							</Text>
							{languageIndexes.map((sourceLanguage) => {
								const choice = selectedLanguageChoices.get(sourceLanguage);
								return (
									<div className="grid gap-3 sm:grid-cols-2" key={sourceLanguage}>
										<Select
											aria-label={`${sourceLanguage} の取り込み方法`}
											label={`${getLanguageLabel(sourceLanguage)} の取り込み方法`}
											placeholder="取り込み方法を選択"
											value={choice?.action ?? ""}
											renderValue={(value) => renderLanguageAction(value)}
											disabled={disabled}
											onValueChange={(value) => {
												if (value === "" || value === "add" || value === "map")
													onLanguageActionChange(sourceLanguage, value);
											}}
										>
											<Select.Option value="">選択してください</Select.Option>
											<Select.Option value="add">利用可能な言語に追加</Select.Option>
											<Select.Option value="map">既存言語へ変更</Select.Option>
										</Select>
										{choice?.action === "map" ? (
											<Select
												aria-label={`${sourceLanguage} の変更先言語`}
												label={`${getLanguageLabel(sourceLanguage)} の変更先言語`}
												placeholder="変更先を選択"
												value={choice.targetLanguage ?? ""}
												renderValue={(value) => renderTargetLanguage(value)}
												disabled={disabled}
												onValueChange={(value) => {
													if (typeof value === "string")
														onLanguageTargetChange(sourceLanguage, value);
												}}
											>
												<Select.Option value="">変更先を選択</Select.Option>
												{availableLanguages.map((language) => (
													<Select.Option key={language} value={language}>
														{getLanguageLabel(language)}
													</Select.Option>
												))}
											</Select>
										) : null}
									</div>
								);
							})}
						</div>
					) : null}
					<ImportPlanSummary plan={plan} />
				</>
			) : targetCurrent ? null : (
				<Text role="status" variant="secondary" size="base">
					取り込み先の現在データを読み込んでいます。
				</Text>
			)}

			<DataImportDetailsDialog
				source={draft.source}
				plan={plan}
				targetCurrent={targetCurrent}
				selectedNewsIndex={selectedNewsIndex}
				newsChoices={draft.newsChoices}
				languageChoices={draft.languageChoices}
				disabled={disabled}
				onNewsDecisionChange={(index, choice) => {
					if (!choice) onNewsDecisionChange(index, null);
					else if (choice.action === "skip") onNewsDecisionChange(index, "skip");
					else onNewsDecisionChange(index, choice.mode);
				}}
				onManualSlugChange={onManualSlugChange}
				onClose={() => setSelectedNewsIndex(null)}
			/>
		</div>
	);
}
