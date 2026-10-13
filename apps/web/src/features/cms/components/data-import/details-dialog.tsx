"use client";

import { Badge, Button, Dialog, Input, Select, Text } from "@cloudflare/kumo";

import type { DataImportPlan, DataImportTargetCurrent, ScopeDataExport } from "@repo/core/types";

import type { DataImportLanguageChoice, DataImportNewsChoice } from "../../data-import-model";
import type { DataImportReadonly } from "../../data-import-model";
import { getDataImportDisplayTranslations } from "../../data-import/display";
import { TranslationComparison } from "./translation-review";

interface DataImportDetailsDialogProps {
	source: DataImportReadonly<ScopeDataExport>;
	plan: DataImportPlan | null;
	targetCurrent: DataImportReadonly<DataImportTargetCurrent> | null;
	selectedNewsIndex: number | null;
	newsChoices: readonly DataImportNewsChoice[];
	languageChoices: readonly DataImportLanguageChoice[];
	disabled: boolean;
	onNewsDecisionChange: (newsIndex: number, choice: DataImportNewsChoice | null) => void;
	onManualSlugChange: (newsIndex: number, slug: string) => void;
	onClose: () => void;
}

function getLanguageName(language: string) {
	try {
		const name = new Intl.DisplayNames(["ja"], { type: "language" }).of(language);
		return name ? `${name}（${language}）` : language;
	} catch {
		return language;
	}
}

function getChoiceValue(choice: DataImportNewsChoice | undefined) {
	if (!choice) return "";
	if (choice.action === "skip") return "skip";
	return choice.mode;
}

function renderChoiceValue(value: string) {
	if (value === "skip") return "スキップ";
	if (value === "auto") return "空いている連番で追加";
	if (value === "manual") return "変更後slugを入力";
	return "重複時の扱いを選択";
}

function getDecision(
	newsIndex: number,
	choice: string,
	newsChoices: readonly DataImportNewsChoice[],
): DataImportNewsChoice | null {
	if (choice === "") return null;
	if (choice === "skip") return { newsIndex, action: "skip" };
	if (choice === "auto") return { newsIndex, action: "rename", mode: "auto" };
	if (choice === "manual") {
		const current = newsChoices.find((item) => item.newsIndex === newsIndex);
		return {
			newsIndex,
			action: "rename",
			mode: "manual",
			targetSlug:
				current?.action === "rename" && current.mode === "manual" ? current.targetSlug : "",
		};
	}
	return null;
}

function getImportedTagLabels(
	news: DataImportReadonly<ScopeDataExport["news"][number]>,
	source: DataImportReadonly<ScopeDataExport>,
	plan: DataImportPlan | null,
) {
	const sourceTags = new Map(source.tags.map((tag) => [tag.slug, tag.name]));
	const plannedTags = new Map((plan?.tags ?? []).map((tag) => [tag.sourceSlug, tag.targetName]));
	return news.tags.map((slug) => {
		const sourceName = sourceTags.get(slug) ?? slug;
		const targetName = plannedTags.get(slug) ?? sourceName;
		return sourceName === targetName ? sourceName : `${sourceName} → ${targetName}`;
	});
}

export function DataImportDetailsDialog({
	source,
	plan,
	targetCurrent,
	selectedNewsIndex,
	newsChoices,
	languageChoices,
	disabled,
	onNewsDecisionChange,
	onManualSlugChange,
	onClose,
}: DataImportDetailsDialogProps) {
	const activeIndex = selectedNewsIndex;
	const sourceNews = activeIndex === null ? undefined : source.news[activeIndex];
	const plannedNews = activeIndex === null || plan === null ? undefined : plan.news[activeIndex];
	const targetNews = plannedNews?.targetNewsId
		? targetCurrent?.news.find((news) => news.id === plannedNews.targetNewsId)
		: undefined;
	const displayTranslations = sourceNews
		? getDataImportDisplayTranslations(sourceNews.translations, source.scope.defaultLanguage)
		: [];
	const currentChoice =
		activeIndex === null
			? undefined
			: newsChoices.find((choice) => choice.newsIndex === activeIndex);
	const selectedValue = getChoiceValue(currentChoice);
	const sourceTags = sourceNews ? getImportedTagLabels(sourceNews, source, plan) : [];
	const mappedLanguages = new Map(languageChoices.map((choice) => [choice.sourceLanguage, choice]));
	const translationComparisons = displayTranslations.map(({ translation, sourceIndex }) => {
		const plannedTranslation = plannedNews?.translations[sourceIndex];
		const sourceLanguage = plannedTranslation?.sourceLanguage ?? translation.lang;
		const languageChoice = mappedLanguages.get(sourceLanguage);
		const targetLanguage =
			plannedTranslation?.targetLanguage ??
			(languageChoice?.action === "add"
				? sourceLanguage
				: languageChoice?.action === "map"
					? languageChoice.targetLanguage || null
					: targetCurrent?.scope.availableLanguages.includes(sourceLanguage)
						? sourceLanguage
						: null);
		const currentTranslation = targetLanguage
			? targetNews?.translations.find((item) => item.lang === targetLanguage)
			: undefined;
		return { translation, targetLanguage, currentTranslation };
	});

	return (
		<Dialog.Root
			open={activeIndex !== null}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<Dialog size="xl" className="grid max-h-[85vh] gap-4 overflow-auto p-5">
				<Dialog.Title>
					{displayTranslations[0]?.translation.title || sourceNews?.slug || "記事の取り込み詳細"}
				</Dialog.Title>
				<Dialog.Description>
					元slug: {sourceNews?.slug ?? "—"}・取り込みslug: {plannedNews?.targetSlug ?? "未確定"}
				</Dialog.Description>
				{sourceNews && plannedNews?.isDuplicate ? (
					<div className="grid gap-3">
						<Select
							aria-label={`${sourceNews.slug} の重複時の扱い`}
							label="この記事の重複時の扱い"
							placeholder="扱いを選択"
							value={selectedValue}
							renderValue={(value) => renderChoiceValue(value)}
							disabled={disabled}
							onValueChange={(value) => {
								if (typeof value !== "string" || activeIndex === null) return;
								onNewsDecisionChange(activeIndex, getDecision(activeIndex, value, newsChoices));
							}}
						>
							<Select.Option value="skip">スキップ</Select.Option>
							<Select.Option value="auto">空いている連番で追加</Select.Option>
							<Select.Option value="manual">変更後slugを入力</Select.Option>
						</Select>
						{currentChoice?.action === "rename" && currentChoice.mode === "manual" ? (
							<Input
								aria-label={`${sourceNews.slug} の変更後slug`}
								label="変更後slug"
								maxLength={200}
								value={currentChoice.targetSlug}
								disabled={disabled}
								onChange={(event) => {
									if (activeIndex !== null) onManualSlugChange(activeIndex, event.target.value);
								}}
							/>
						) : null}
					</div>
				) : null}
				{sourceNews && plannedNews ? (
					<div className="grid gap-4">
						<Text as="h3" variant="heading" size="lg">
							{targetNews ? "翻訳の比較" : "取り込む翻訳"}
						</Text>
						{translationComparisons?.map(({ translation, targetLanguage, currentTranslation }) => {
							return (
								<TranslationComparison
									key={translation.lang}
									translation={translation}
									currentTranslation={currentTranslation}
									targetLanguage={targetLanguage}
									tags={sourceTags}
									targetTags={targetNews?.tags.map((tag) => tag.name) ?? []}
								/>
							);
						})}
					</div>
				) : null}
				{targetNews ? (
					<div className="grid gap-3">
						<div className="grid gap-1">
							<Text as="h3" variant="heading" size="lg">
								既存記事との比較
							</Text>
							<Text variant="secondary" size="base">
								{targetNews.slug}（{targetNews.translations.length}件の翻訳）は変更せず保持します。
							</Text>
						</div>
						<div className="flex flex-wrap gap-2" aria-label="取り込み先の記事タグ">
							{targetNews.tags.length > 0 ? (
								targetNews.tags.map((tag) => (
									<Badge key={tag.id} variant="outline">
										{tag.name}
									</Badge>
								))
							) : (
								<Text variant="secondary" size="base">
									既存タグなし
								</Text>
							)}
						</div>
					</div>
				) : null}
				{displayTranslations.some(({ translation }) => mappedLanguages.has(translation.lang)) ? (
					<Text variant="secondary" size="base">
						未登録言語の処理:{" "}
						{displayTranslations
							.flatMap(({ translation }) => {
								const choice = mappedLanguages.get(translation.lang);
								if (!choice) return [];
								return [
									choice.action === "add"
										? `${getLanguageName(translation.lang)}を追加`
										: `${getLanguageName(translation.lang)}を${choice.targetLanguage ? getLanguageName(choice.targetLanguage) : "未選択"}へ変更`,
								];
							})
							.join("・")}
					</Text>
				) : null}
				<div className="flex justify-end">
					<Button type="button" variant="secondary" onClick={onClose}>
						閉じる
					</Button>
				</div>
			</Dialog>
		</Dialog.Root>
	);
}
