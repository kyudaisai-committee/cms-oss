import type { ReactNode } from "react";

import { cmsSettings } from "#web/cms-settings";
import { Providers, type ScopeData } from "#web/components/providers";
import { listScopes } from "#web/lib/cms/read.server";

import "../styles.css";

interface RootLayoutProps {
	children: ReactNode;
}

export default async function RootLayout({ children }: RootLayoutProps) {
	const scopeData = listScopes()
		.then((scopes): ScopeData => ({ scopes, scopeLoadError: null }))
		.catch((): ScopeData => ({
			scopes: [],
			scopeLoadError: "スコープを読み込めませんでした。しばらくしてから再度お試しください。",
		}));
	return (
		<Providers scopeData={scopeData}>
			<meta name="description" content={cmsSettings.description} />
			{cmsSettings.iconUrl ? <link rel="icon" href={cmsSettings.iconUrl} /> : null}
			{children}
		</Providers>
	);
}

export async function getConfig() {
	return {
		render: "dynamic",
	} as const;
}
