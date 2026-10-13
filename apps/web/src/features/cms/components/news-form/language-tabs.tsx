import { Badge, Link, Tabs, type TabsItem, Text } from "@cloudflare/kumo";

import { scopePath } from "#web/features/cms/site";
import type { AdminNewsDto, ScopeRef } from "@repo/core/types";

import { getLanguageLabel } from "./formatting";

export function NewsLanguageTabs({
	activeLang,
	availableLanguages,
	currentNews,
	initialSlug,
	parentId,
	scope,
	translationMissing,
}: {
	activeLang: string;
	availableLanguages?: string[] | undefined;
	currentNews?: AdminNewsDto | undefined;
	initialSlug?: string | undefined;
	parentId?: string | undefined;
	scope: ScopeRef;
	translationMissing?: boolean | undefined;
}) {
	const isEdit = parentId !== undefined;
	const currentSlug = currentNews?.slug ?? initialSlug ?? "";
	const languages = Array.from(
		new Set([
			...(availableLanguages ?? ["ja", "en"]),
			...(currentNews?.translations ?? []).map((translation) => translation.lang),
			activeLang,
		]),
	);

	const languageTabs: TabsItem[] = languages.map((lang) => {
		const translation = currentNews?.translations?.find((candidate) => candidate.lang === lang);
		const isCurrent = lang === activeLang;
		const exists = translation !== undefined;
		const href =
			parentId !== undefined
				? `${scopePath(scope)}/${encodeURIComponent(parentId)}?lang=${encodeURIComponent(lang)}`
				: currentSlug
					? `${scopePath(scope)}/new?slug=${encodeURIComponent(currentSlug)}&lang=${encodeURIComponent(lang)}`
					: `${scopePath(scope)}/new?lang=${encodeURIComponent(lang)}`;

		return {
			value: lang,
			label: (
				<span className="flex items-center gap-1.5">
					<span>{getLanguageLabel(lang)}</span>
					{isCurrent && isEdit && exists ? (
						<Badge variant={currentNews?.status === "published" ? "success" : "secondary"}>
							{currentNews?.status === "published" ? "公開中" : "下書き"}
						</Badge>
					) : exists ? (
						<Badge variant={translation.status === "published" ? "success" : "secondary"}>
							{translation.status === "published" ? "公開中" : "下書き"}
						</Badge>
					) : (
						<Badge variant="outline">未作成</Badge>
					)}
				</span>
			),
			render: (tabProps) => <Link {...tabProps} href={href} />,
			nativeButton: false,
		};
	});

	return (
		<div className="mb-6 flex flex-col gap-2">
			<div className="flex items-center justify-between">
				<Text as="h2" bold size="base">
					言語別記事
				</Text>
			</div>
			<Tabs className="w-fit" tabs={languageTabs} value={activeLang} variant="segmented" />
			{translationMissing ? (
				<Text variant="secondary" size="base">
					この言語の翻訳はまだありません。内容を入力して保存すると追加されます。
				</Text>
			) : null}
		</div>
	);
}
