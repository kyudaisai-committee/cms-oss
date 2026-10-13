"use client";

import { Button, Input, LayerCard, Select, Text } from "@cloudflare/kumo";
import type { ChangeEvent } from "react";

import { StatusMessage } from "#web/components/status-message";
import type { ScopeDto } from "@repo/core/types";
import type { DataImportResult, DataImportTargetCurrent } from "@repo/core/types";

import {
	getDataImportSourceOptionLabel,
	getDataImportSourceOptionValue,
	getDataImportSourceSummary,
	type DataImportEditingDraft,
	type DataImportOriginal,
	type DataImportReadonly,
} from "../../data-import-model";
import { DataImportEditor } from "./editor";

export interface DataImportPanelViewProps {
	scope: ScopeDto;
	original: DataImportOriginal | null;
	targetCurrent: DataImportReadonly<DataImportTargetCurrent> | null;
	editingDraft: DataImportEditingDraft | null;
	sourceIndex: string;
	isReading: boolean;
	isPreviewing: boolean;
	isImporting: boolean;
	commitReady: boolean;
	error: string | null;
	result: DataImportResult | null;
	onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
	onSourceChange: (index: string) => void;
	onImport: () => void;
	onNewsDecisionChange: (newsIndex: number, action: "skip" | "auto" | "manual" | null) => void;
	onManualSlugChange: (newsIndex: number, slug: string) => void;
	onLanguageActionChange: (sourceLanguage: string, action: "" | "add" | "map") => void;
	onLanguageTargetChange: (sourceLanguage: string, targetLanguage: string) => void;
}

export function DataImportPanelView({
	scope,
	original,
	targetCurrent,
	editingDraft,
	sourceIndex,
	isReading,
	isPreviewing,
	isImporting,
	commitReady,
	error,
	result,
	onFileChange,
	onSourceChange,
	onImport,
	onNewsDecisionChange,
	onManualSlugChange,
	onLanguageActionChange,
	onLanguageTargetChange,
}: DataImportPanelViewProps) {
	const source = editingDraft?.source;
	const sourceSummary = source ? getDataImportSourceSummary(source) : null;
	const canImport = commitReady && !isImporting;

	return (
		<LayerCard className="grid gap-4 p-5">
			<div className="grid gap-1">
				<Text as="h2" variant="heading" size="lg">
					データのインポート
				</Text>
				<Text variant="secondary" size="base">
					JSON配列から元データを1件選び、このスコープへ新しいお知らせとして追加します。取り込み先の名前・年度・サイトは変更しません。
				</Text>
				<Text variant="secondary" size="base">
					取り込み先: {scope.name}（{scope.year} · {scope.site}）
				</Text>
			</div>

			<Input
				accept="application/json,.json"
				aria-label="インポートするJSONファイル"
				disabled={isImporting}
				type="file"
				label="JSONファイル"
				description="エクスポートしたJSON配列から元データを選びます。"
				onChange={onFileChange}
			/>

			{isReading ? <Text role="status">ファイルを読み込んでいます…</Text> : null}
			{error ? <StatusMessage tone="error">{error}</StatusMessage> : null}

			{original ? (
				<Select
					aria-label="読み取る元のスコープデータ"
					label="読み取る元データ"
					placeholder="元データを選択"
					value={sourceIndex}
					renderValue={(value) => {
						if (value === "") return "";
						const index = Number(value);
						const entry =
							Number.isSafeInteger(index) && index >= 0 && String(index) === value
								? original.entries[index]
								: undefined;
						return entry ? getDataImportSourceOptionLabel(entry, index) : "";
					}}
					disabled={isImporting}
					onValueChange={(value) => {
						if (typeof value === "string") onSourceChange(value);
					}}
				>
					{original.entries.map((entry, index) => (
						<Select.Option key={index} value={getDataImportSourceOptionValue(index)}>
							{getDataImportSourceOptionLabel(entry, index)}
						</Select.Option>
					))}
				</Select>
			) : null}

			{editingDraft && source && sourceSummary ? (
				<>
					<div className="grid gap-1">
						<Text variant="secondary" size="base">
							元データ: {source.scope.name}（{source.scope.year} · {source.scope.site}）
						</Text>
						<Text variant="secondary" size="base">
							お知らせ {sourceSummary.articleCount}件・翻訳 {sourceSummary.translationCount}件・タグ{" "}
							{sourceSummary.tagCount}件
						</Text>
					</div>
					{isPreviewing ? (
						<Text role="status" variant="secondary" size="base">
							取り込み先の最新状態を確認しています。表示中の内容は引き続き編集できます。
						</Text>
					) : null}
					<DataImportEditor
						draft={editingDraft}
						targetCurrent={targetCurrent}
						disabled={isImporting}
						onNewsDecisionChange={onNewsDecisionChange}
						onManualSlugChange={onManualSlugChange}
						onLanguageActionChange={onLanguageActionChange}
						onLanguageTargetChange={onLanguageTargetChange}
					/>
					<Button
						disabled={!canImport || isPreviewing}
						onClick={onImport}
						type="button"
						variant="primary"
					>
						{isImporting ? "取り込み中…" : "この内容を取り込む"}
					</Button>
				</>
			) : null}

			{result ? (
				<StatusMessage>
					{`お知らせ ${result.createdNews}件・翻訳 ${result.createdTranslations}件・タグ ${result.createdTags}件を追加しました。既存タグ ${result.reusedTags}件を再利用し、お知らせ ${result.skippedNews}件をスキップしました。`}
				</StatusMessage>
			) : null}
		</LayerCard>
	);
}
