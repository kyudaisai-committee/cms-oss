import { Suspense } from "react";

import { ScopeSelectorSkeleton } from "#web/components/cms-loading-skeleton";
import { CmsShell } from "#web/components/cms-shell";
import { DocumentTitle } from "#web/components/document-title";
import { ScopeSelector } from "#web/features/cms/components/scope-selector";

export default async function HomePage() {
	return (
		<CmsShell>
			<DocumentTitle />
			<Suspense fallback={<ScopeSelectorSkeleton />}>
				<ScopeSelector />
			</Suspense>
		</CmsShell>
	);
}

export async function getConfig() {
	return {
		render: "dynamic",
	} as const;
}
