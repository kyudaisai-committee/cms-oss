import { Badge, Text } from "@cloudflare/kumo";
import type { ReactNode } from "react";

import { MarkdownPreview } from "#web/features/cms/preview/preview";
import type { DataImportTargetCurrent, ScopeDataExport } from "@repo/core/types";

import type { DataImportReadonly } from "../../data-import-model";

type SourceTranslation = DataImportReadonly<
	ScopeDataExport["news"][number]["translations"][number]
>;
type TargetTranslation = DataImportReadonly<
	DataImportTargetCurrent["news"][number]["translations"][number]
>;

function getLanguageName(language: string) {
	try {
		const name = new Intl.DisplayNames(["ja"], { type: "language" }).of(language);
		return name ? `${name}（${language}）` : language;
	} catch {
		return language;
	}
}

function getPublicationStatus(status: "draft" | "published", publishedAt: string | null) {
	if (status === "draft") return "下書き";
	if (publishedAt && new Date(publishedAt).getTime() > Date.now()) return "公開予定";
	return "公開中";
}

function formatPublicationDate(value: string | null) {
	if (!value) return "未設定";
	return new Intl.DateTimeFormat("ja-JP", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		timeZone: "Asia/Tokyo",
	}).format(new Date(value));
}

function TagList({ tags }: { tags: readonly string[] }) {
	if (tags.length === 0)
		return (
			<Text variant="secondary" size="base">
				タグなし
			</Text>
		);
	return (
		<div className="flex flex-wrap gap-2">
			{tags.map((tag) => (
				<Badge key={tag} variant="outline">
					{tag}
				</Badge>
			))}
		</div>
	);
}

function TranslationField({
	sourceLabel,
	source,
	currentLabel,
	current,
}: {
	sourceLabel: string;
	source: ReactNode;
	currentLabel: string;
	current: ReactNode;
}) {
	return (
		<div
			aria-label={`${sourceLabel}の比較行`}
			className="grid gap-x-4 gap-y-3 md:grid-cols-2 md:grid-rows-[auto_auto]"
			role="group"
		>
			<div
				aria-label={`取り込む側: ${sourceLabel}`}
				className="grid min-w-0 content-start gap-1 md:row-span-2 md:grid-rows-subgrid md:gap-y-0"
				role="group"
			>
				<Text variant="secondary" size="base">
					<span className="md:hidden">取り込み側: </span>
					{sourceLabel}
				</Text>
				{source}
			</div>
			<div
				aria-label={`現在の内容: ${currentLabel}`}
				className="grid min-w-0 content-start gap-1 md:row-span-2 md:grid-rows-subgrid md:gap-y-0"
				role="group"
			>
				<Text variant="secondary" size="base">
					<span className="md:hidden">現在: </span>
					{currentLabel}
				</Text>
				{current}
			</div>
		</div>
	);
}

function CurrentValue({
	translation,
	children,
}: {
	translation: TargetTranslation | undefined;
	children: ReactNode;
}) {
	return translation ? (
		<>{children}</>
	) : (
		<Text variant="secondary" size="base">
			既存翻訳なし
		</Text>
	);
}

export function TranslationComparison({
	translation,
	currentTranslation,
	targetLanguage,
	tags,
	targetTags,
}: {
	translation: SourceTranslation;
	currentTranslation: TargetTranslation | undefined;
	targetLanguage: string | null;
	tags: readonly string[];
	targetTags: readonly string[];
}) {
	const currentLanguage = currentTranslation?.lang ?? targetLanguage;
	const publicationStatus = `${getPublicationStatus(translation.status, translation.publishedAt)}・公開日時: ${formatPublicationDate(translation.publishedAt)}`;
	const currentPublicationStatus = currentTranslation
		? `${getPublicationStatus(currentTranslation.status, currentTranslation.publishedAt)}・公開日時: ${formatPublicationDate(currentTranslation.publishedAt)}`
		: "既存翻訳なし";

	return (
		<section
			aria-label={`${translation.lang}から${currentLanguage ?? "未選択"}への翻訳比較`}
			className="grid gap-3"
		>
			<div className="grid gap-x-4 gap-y-2 md:grid-cols-2">
				<Text as="h4" variant="heading" size="lg">
					取り込む翻訳: {getLanguageName(translation.lang)}
				</Text>
				<Text as="h4" variant="heading" size="lg">
					{currentTranslation
						? `現在の翻訳: ${getLanguageName(currentTranslation.lang)}`
						: `既存翻訳なし: ${currentLanguage ? getLanguageName(currentLanguage) : "言語未選択"}`}
				</Text>
			</div>
			<TranslationField
				sourceLabel="取り込み先言語"
				source={<Text>{targetLanguage ? getLanguageName(targetLanguage) : "選択が必要"}</Text>}
				currentLabel="比較対象言語"
				current={<Text>{currentLanguage ? getLanguageName(currentLanguage) : "選択が必要"}</Text>}
			/>
			<TranslationField
				sourceLabel="公開状態・公開日時"
				source={<Text>{publicationStatus}</Text>}
				currentLabel="公開状態・公開日時"
				current={<Text>{currentPublicationStatus}</Text>}
			/>
			<TranslationField
				sourceLabel="タイトル"
				source={<Text>{translation.title}</Text>}
				currentLabel="タイトル"
				current={
					<CurrentValue translation={currentTranslation}>
						<Text>{currentTranslation?.title}</Text>
					</CurrentValue>
				}
			/>
			<TranslationField
				sourceLabel="概要"
				source={<Text>{translation.summary || "概要なし"}</Text>}
				currentLabel="概要"
				current={
					<CurrentValue translation={currentTranslation}>
						<Text>{currentTranslation?.summary || "概要なし"}</Text>
					</CurrentValue>
				}
			/>
			<TranslationField
				sourceLabel="タグ"
				source={<TagList tags={tags} />}
				currentLabel="タグ"
				current={<TagList tags={targetTags} />}
			/>
			<TranslationField
				sourceLabel="本文またはリンク"
				source={
					<MarkdownPreview content={translation.content} contentType={translation.contentType} />
				}
				currentLabel="本文またはリンク"
				current={
					currentTranslation ? (
						<MarkdownPreview
							content={currentTranslation.content}
							contentType={currentTranslation.contentType}
						/>
					) : (
						<Text variant="secondary" size="base">
							既存翻訳なし
						</Text>
					)
				}
			/>
		</section>
	);
}
