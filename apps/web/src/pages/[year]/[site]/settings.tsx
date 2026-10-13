import { LayerCard, Text } from "@cloudflare/kumo";
import { Suspense } from "react";
import type { PageProps } from "waku/router";

import { ScopeSettingsSkeleton } from "#web/components/cms-loading-skeleton";
import { CmsShell } from "#web/components/cms-shell";
import { DocumentTitle } from "#web/components/document-title";
import { StatusMessage } from "#web/components/status-message";
import { DataExportButton } from "#web/features/cms/components/data-export-button";
import { DataImportPanel } from "#web/features/cms/components/data-import/panel";
import { getScope } from "#web/lib/cms/read.server";
import { scopeRefSchema, type ScopeRef } from "@repo/core/types";

interface ScopeSettingsPageProps extends PageProps<"/[year]/[site]/settings"> {}

export default async function ScopeSettingsPage({ year, site }: ScopeSettingsPageProps) {
	const parsed = scopeRefSchema.safeParse({ year, site });
	if (!parsed.success) {
		return (
			<CmsShell>
				<section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
					<StatusMessage tone="error">指定された年度またはサイトは利用できません。</StatusMessage>
				</section>
			</CmsShell>
		);
	}
	const scope: ScopeRef = parsed.data;

	return (
		<CmsShell pageTitle="設定" site={scope.site} year={scope.year}>
			<Suspense fallback={<ScopeSettingsSkeleton />}>
				<ScopeSettingsContent scope={scope} />
			</Suspense>
		</CmsShell>
	);
}

async function ScopeSettingsContent({ scope }: { scope: ScopeRef }) {
	try {
		const scopeDto = await getScope(scope);
		return (
			<>
				<DocumentTitle title={`${scopeDto.name} | 設定`} />
				<section className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-8 sm:px-6 lg:py-10">
					<LayerCard className="grid gap-4 p-5">
						<div className="grid gap-1">
							<Text as="h1" variant="heading" size="lg">
								データのエクスポート
							</Text>
							<Text variant="secondary" size="base">
								{scopeDto.name}のお知らせとタグをJSON形式でダウンロードします。
							</Text>
						</div>
						<DataExportButton scope={scope} />
					</LayerCard>
					<DataImportPanel scope={scopeDto} />
				</section>
			</>
		);
	} catch {
		return (
			<section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
				<StatusMessage tone="error">
					スコープを読み込めませんでした。存在しないスコープはエクスポートできません。
				</StatusMessage>
			</section>
		);
	}
}

export async function getConfig() {
	return { render: "dynamic" } as const;
}
