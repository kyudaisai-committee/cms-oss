import { LayerCard, Text } from "@cloudflare/kumo";

import { CmsShell } from "#web/components/cms-shell";
import { DocumentTitle } from "#web/components/document-title";
import { DataExportButton } from "#web/features/cms/components/data-export-button";

export default async function SettingsPage() {
	return (
		<CmsShell pageTitle="設定">
			<DocumentTitle title="設定" />
			<section className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-8 sm:px-6 lg:py-10">
				<LayerCard className="grid gap-4 p-5">
					<div className="grid gap-1">
						<Text as="h1" variant="heading" size="lg">
							データのエクスポート
						</Text>
						<Text variant="secondary" size="base">
							登録されているすべてのスコープのお知らせとタグをJSON形式でダウンロードします。
						</Text>
					</div>
					<DataExportButton />
				</LayerCard>
			</section>
		</CmsShell>
	);
}

export async function getConfig() {
	return { render: "dynamic" } as const;
}
