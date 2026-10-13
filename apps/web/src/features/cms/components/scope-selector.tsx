"use client";

import { Empty, LayerCard, LinkButton, Select, Text } from "@cloudflare/kumo";
import { useAtomValue, useSetAtom } from "jotai";
import { NewspaperIcon } from "lucide-react";
import { useRouter } from "waku";

import { useScopeData } from "#web/components/providers";
import { StatusMessage } from "#web/components/status-message";
import { scopePath } from "#web/features/cms/site";

import { availableScopesAtom, scopeLoadErrorAtom } from "../store";
import { CreateScopeCard } from "./scope-selector/create-scope-card";
import { ScopeLanguageSettings } from "./scope-selector/language-settings";

export function ScopeSelector() {
	const router = useRouter();
	const scopeData = useScopeData();
	const hydratedScopes = useAtomValue(availableScopesAtom);
	const scopes = hydratedScopes.length > 0 ? hydratedScopes : (scopeData?.scopes ?? hydratedScopes);
	const hydratedScopeLoadError = useAtomValue(scopeLoadErrorAtom);
	const scopeLoadError = scopeData?.scopeLoadError ?? hydratedScopeLoadError;
	const setAvailableScopes = useSetAtom(availableScopesAtom);
	const siteCandidates = [...new Set(scopes.map((scope) => scope.site))];

	if (scopeLoadError) {
		return (
			<section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
				<StatusMessage tone="error">{scopeLoadError}</StatusMessage>
			</section>
		);
	}

	return (
		<section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:py-12">
			<div className="mb-8 flex flex-col gap-2">
				<Text as="h1" variant="heading" size="lg">
					管理するスコープを選択
				</Text>
				<Text variant="secondary" size="base">
					年度とサイトを選択して、お知らせを管理します。
				</Text>
			</div>

			<CreateScopeCard siteCandidates={siteCandidates} />

			{scopes.length === 0 ? (
				<LayerCard className="p-0">
					<Empty
						title="利用できるスコープがありません"
						description="年度とサイトを登録すると、ここから管理を開始できます。"
					/>
				</LayerCard>
			) : (
				<>
					<div className="mb-5 flex flex-col gap-2 sm:max-w-sm">
						<Select
							aria-label="スコープをすばやく開く"
							id="scope-shortcut"
							label="スコープをすばやく開く"
							placeholder="年度とサイトを選択"
							onValueChange={(value) => {
								if (typeof value !== "string") return;
								const scope = scopes.find((candidate) => candidate.id === value);
								if (scope) void router.push(scopePath(scope));
							}}
							value=""
						>
							{scopes.map((scope) => (
								<Select.Option key={scope.id} value={scope.id}>
									{scope.name}
								</Select.Option>
							))}
						</Select>
					</div>
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{scopes.map((scope) => (
							<LayerCard className="p-5" key={scope.id}>
								<div className="flex flex-col gap-2">
									<div className="flex items-start justify-between gap-2">
										<Text as="h2" variant="heading" size="lg">
											{scope.name}
										</Text>
										<ScopeLanguageSettings
											scope={scope}
											onUpdated={(updated) =>
												setAvailableScopes((current) =>
													current.map((candidate) =>
														candidate.id === updated.id ? updated : candidate,
													),
												)
											}
										/>
									</div>
									<Text variant="secondary" size="base">
										{scope.year} · {scope.site}
									</Text>
									<LinkButton href={scopePath(scope)} className="mt-2 w-fit" variant="primary">
										<NewspaperIcon aria-hidden="true" className="size-4" />
										お知らせを管理
									</LinkButton>
								</div>
							</LayerCard>
						))}
					</div>
				</>
			)}
		</section>
	);
}
