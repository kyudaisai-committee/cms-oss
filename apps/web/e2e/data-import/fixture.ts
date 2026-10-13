import type { DataExport, DataExportScope, DataExportTranslation } from "@repo/core/types";

const scope = {
	year: 2025,
	site: "source",
	name: "同名の移行元",
	availableLanguages: ["ja", "en", "fr", "de", "it"],
	defaultLanguage: "ja",
} satisfies DataExportScope;

type MarkdownTranslation = Extract<DataExportTranslation, { contentType: "markdown" }>;

export const scheduledPublication = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
export const autoJapaneseTitle =
	"自動記事の元タイトルは取り込み側で複数行に折り返され現在の記事より長く表示されます";
export const autoJapaneseSummary =
	"取り込み側の概要も現在の記事より長く、左右の比較欄でタイトルや概要の値の開始位置が揃い、長さが異なっても次の項目が正しく揃うことを確認するための説明です。";
export const manualJapaneseTitle =
	"手入力記事の日本語タイトルは英語翻訳より先に表示され、一覧で日本語が既定言語として優先されます";
export const manualJapaneseSummary =
	"取り込む側の日本語概要は比較欄の開始位置がそろうことを確認するため、既存概要より長く複数行に折り返される内容にしています。";

function markdown(
	lang: string,
	title: string,
	status: "draft" | "published" = "draft",
	publishedAt: string | null = null,
	summary: string = `概要 ${title}`,
): MarkdownTranslation {
	return {
		lang,
		title,
		summary,
		contentType: "markdown",
		content: `# ${title}\n\n本文 ${title}`,
		status,
		publishedAt,
	};
}

export function sourceExport(): DataExport {
	return [
		{
			version: 1,
			exportedAt: new Date().toISOString(),
			scope,
			tags: [],
			news: [
				{ slug: "wrong-source", tags: [], translations: [markdown("ja", "選ばない元データ")] },
			],
		},
		{
			version: 1,
			exportedAt: new Date().toISOString(),
			scope,
			tags: [{ name: "元データのタグ名", slug: "reused-tag" }],
			news: [
				{
					slug: "duplicate-auto",
					tags: ["reused-tag"],
					translations: [
						{
							lang: "fr",
							title: "Source French link",
							summary: "French link summary",
							contentType: "link",
							content: "https://example.com/source-fr",
							status: "draft",
							publishedAt: null,
						},
						markdown(
							"ja",
							autoJapaneseTitle,
							"published",
							scheduledPublication,
							autoJapaneseSummary,
						),
					],
				},
				{
					slug: "duplicate-manual",
					tags: [],
					translations: [
						markdown("en", "English manual article title first"),
						markdown("ja", manualJapaneseTitle, "draft", null, manualJapaneseSummary),
					],
				},
				{
					slug: "duplicate-skip",
					tags: [],
					translations: [markdown("it", "スキップ記事の元タイトル")],
				},
				{
					slug: "new-article",
					tags: ["reused-tag"],
					translations: [markdown("ja", "新規記事の日本語"), markdown("de", "New German article")],
				},
			],
		},
	];
}
