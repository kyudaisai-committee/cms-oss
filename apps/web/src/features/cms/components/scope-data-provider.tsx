"use client";

import { Provider } from "jotai";
import { useHydrateAtoms } from "jotai/utils";
import type { ReactNode } from "react";

import type { AdminNewsDto, ScopeRef, TagDto } from "@repo/core/types";

import {
	newsAtom,
	searchTextAtom,
	selectedScopeAtom,
	selectedTagSlugAtom,
	tagsAtom,
} from "../store";

interface ScopeDataProviderProps {
	children: ReactNode;
	scope: ScopeRef;
	news: AdminNewsDto[];
	tags: TagDto[];
}

export function ScopeDataProvider({ children, scope, news, tags }: ScopeDataProviderProps) {
	return (
		<Provider key={`${scope.year}:${scope.site}`}>
			<ScopeDataHydrator news={news} scope={scope} tags={tags}>
				{children}
			</ScopeDataHydrator>
		</Provider>
	);
}

interface ScopeDataHydratorProps {
	children: ReactNode;
	scope: ScopeRef;
	news: AdminNewsDto[];
	tags: TagDto[];
}

function ScopeDataHydrator({ children, scope, news, tags }: ScopeDataHydratorProps) {
	useHydrateAtoms([
		[selectedScopeAtom, scope],
		[newsAtom, news],
		[tagsAtom, tags],
		[searchTextAtom, ""],
		[selectedTagSlugAtom, null],
	] as const);

	return children;
}
