"use client";

import { LinkProvider, Toasty } from "@cloudflare/kumo";
import { Provider, useSetAtom } from "jotai";
import { createContext, Suspense, use, useContext, useEffect, type ReactNode } from "react";

import { availableScopesAtom, scopeLoadErrorAtom } from "#web/features/cms/store";
import type { ScopeDto } from "@repo/core/types";

import { KumoLinkAdapter } from "./kumo-link";
import { ThemeProvider } from "./theme-provider";

export interface ScopeData {
	scopes: ScopeDto[];
	scopeLoadError: string | null;
}

type ScopeDataPromise = Promise<ScopeData>;

const ScopeDataContext = createContext<ScopeDataPromise | null>(null);

interface ProvidersProps {
	children: ReactNode;
	scopeData: ScopeDataPromise;
}

export function Providers({ children, scopeData }: ProvidersProps) {
	return (
		<LinkProvider component={KumoLinkAdapter}>
			<ThemeProvider>
				<Provider>
					<ScopeDataContext.Provider value={scopeData}>
						<Suspense fallback={null}>
							<ScopeStateHydrator scopeData={scopeData} />
						</Suspense>
						<Toasty>{children}</Toasty>
					</ScopeDataContext.Provider>
				</Provider>
			</ThemeProvider>
		</LinkProvider>
	);
}

export function useScopeData(): ScopeData | null {
	const scopeData = useContext(ScopeDataContext);
	return scopeData ? use(scopeData) : null;
}

function ScopeStateHydrator({ scopeData }: { scopeData: ScopeDataPromise }) {
	const { scopeLoadError, scopes } = use(scopeData);
	const setAvailableScopes = useSetAtom(availableScopesAtom);
	const setScopeLoadError = useSetAtom(scopeLoadErrorAtom);

	useEffect(() => {
		setAvailableScopes(scopes);
		setScopeLoadError(scopeLoadError);
	}, [scopeLoadError, scopes, setAvailableScopes, setScopeLoadError]);
	return null;
}
