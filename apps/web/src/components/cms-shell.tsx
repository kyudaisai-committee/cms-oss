"use client";

import { Breadcrumbs, Button, DropdownMenu, Sidebar, Link } from "@cloudflare/kumo";
import { useAtomValue } from "jotai";
import {
	BookOpenIcon,
	DatabaseIcon,
	ExternalLinkIcon,
	HouseIcon,
	LayersIcon,
	MonitorIcon,
	MoonIcon,
	SettingsIcon,
	SunIcon,
} from "lucide-react";
import { Suspense, type ReactNode } from "react";

import { cmsSettings } from "#web/cms-settings";
import { ScopeNavigationSkeleton } from "#web/components/cms-loading-skeleton";
import { PageHeader } from "#web/components/kumo/page-header/page-header";
import { getScopeFallbackLabel, scopePath } from "#web/features/cms/site";
import { availableScopesAtom } from "#web/features/cms/store";
import type { Site } from "@repo/core/types";

import { useScopeData } from "./providers";
import { isThemePreference, type ThemePreference } from "./theme";
import { useTheme } from "./theme-provider";

interface CmsShellProps {
	children: ReactNode;
	year?: number;
	site?: Site;
	pageTitle?: string;
}

const themePreferenceLabels: Record<ThemePreference, string> = {
	system: "システム",
	light: "ライト",
	dark: "ダーク",
};

function themeIcon(preference: ThemePreference) {
	const Icon = preference === "system" ? MonitorIcon : preference === "dark" ? MoonIcon : SunIcon;
	return <Icon aria-hidden="true" className="size-4" />;
}

function ThemeSelector() {
	const { mode, preference, setPreference } = useTheme();
	const currentModeLabel = mode === "dark" ? "ダーク" : "ライト";
	const currentSelection =
		preference === "system"
			? `${themePreferenceLabels.system}（現在は${currentModeLabel}）`
			: themePreferenceLabels[preference];

	return (
		<DropdownMenu>
			<DropdownMenu.Trigger
				render={
					<Button
						variant="ghost"
						shape="square"
						size="sm"
						aria-label={`テーマ: ${currentSelection}`}
						title={currentSelection}
						icon={themeIcon(preference)}
					/>
				}
			/>
			<DropdownMenu.Content align="end">
				<DropdownMenu.Group>
					<DropdownMenu.Label>表示テーマ</DropdownMenu.Label>
					<DropdownMenu.RadioGroup
						value={preference}
						onValueChange={(value) => {
							if (isThemePreference(value)) setPreference(value);
						}}
					>
						{(["system", "light", "dark"] as const).map((option) => (
							<DropdownMenu.RadioItem
								key={option}
								closeOnClick
								icon={themeIcon(option)}
								value={option}
							>
								{themePreferenceLabels[option]}
							</DropdownMenu.RadioItem>
						))}
					</DropdownMenu.RadioGroup>
				</DropdownMenu.Group>
			</DropdownMenu.Content>
		</DropdownMenu>
	);
}

function ScopeNavigation({ year, site }: { year: number | undefined; site: Site | undefined }) {
	const scopeData = useScopeData();
	const scopes = useAtomValue(availableScopesAtom);
	const availableScopes = scopes.length > 0 ? scopes : (scopeData?.scopes ?? scopes);

	if (scopeData?.scopeLoadError) return null;

	return (
		<Sidebar.MenuSub>
			{availableScopes.map((scope) => (
				<Sidebar.MenuSubButton
					key={scope.id}
					active={scope.year === year && scope.site === site}
					href={scopePath(scope)}
				>
					{scope.name}
				</Sidebar.MenuSubButton>
			))}
		</Sidebar.MenuSub>
	);
}

export function CmsShell({ children, year, site, pageTitle }: CmsShellProps) {
	const scopes = useAtomValue(availableScopesAtom);
	const scopeData = useScopeData();
	const availableScopes = scopes.length > 0 ? scopes : (scopeData?.scopes ?? scopes);
	const isHome = year === undefined || site === undefined;
	const currentScope =
		year === undefined || site === undefined
			? undefined
			: availableScopes.find((scope) => scope.year === year && scope.site === site);
	const scopeLabel =
		currentScope?.name ??
		(year !== undefined && site !== undefined ? getScopeFallbackLabel({ year, site }) : undefined);
	const scopeRef = year !== undefined && site !== undefined ? { year, site } : undefined;
	const breadcrumbs =
		!isHome && scopeLabel && scopeRef ? (
			<Breadcrumbs>
				{pageTitle ? (
					<>
						<Breadcrumbs.Link icon={<LayersIcon size="1em" />} href={scopePath(scopeRef)}>
							{scopeLabel}
						</Breadcrumbs.Link>
						<Breadcrumbs.Separator />
						<Breadcrumbs.Current>{pageTitle}</Breadcrumbs.Current>
					</>
				) : (
					<Breadcrumbs.Current icon={<LayersIcon size="1em" />}>{scopeLabel}</Breadcrumbs.Current>
				)}
			</Breadcrumbs>
		) : null;
	const pageHeaderContent = (
		<div className="mx-auto -mb-px flex h-[58px] w-full max-w-7xl items-center gap-3 px-4 sm:px-6">
			{breadcrumbs ?? <div className="flex-1" />}
			<div className="shrink-0">
				<ThemeSelector />
			</div>
		</div>
	);
	return (
		<Sidebar.Provider className="h-svh overflow-hidden" defaultOpen resizable peekable>
			<Sidebar>
				<Sidebar.Header>
					<Link
						href="/"
						variant={"current"}
						className="inline-flex w-full min-w-0 flex-row items-center gap-3! px-3 no-underline!"
					>
						<div className="flex min-w-0 flex-1 items-center gap-3 transition-transform duration-(--sidebar-animation-duration) group-data-[state=collapsed]/sidebar:translate-x-[-3px]">
							<DatabaseIcon className="size-4 shrink-0" />
							<span className="flex flex-1 items-center gap-2 truncate overflow-hidden text-left">
								{cmsSettings.name}
							</span>
						</div>
					</Link>
				</Sidebar.Header>
				<Sidebar.Content className="**:gap-1">
					<Sidebar.Group>
						<Sidebar.Menu>
							<Sidebar.MenuButton active={isHome && pageTitle !== "設定"} href="/" icon={HouseIcon}>
								CMS ホーム
							</Sidebar.MenuButton>
						</Sidebar.Menu>
					</Sidebar.Group>
					<Sidebar.Group>
						<Sidebar.GroupLabel>コンテンツ管理</Sidebar.GroupLabel>
						<Sidebar.Menu>
							<Sidebar.MenuItem>
								<Sidebar.Collapsible defaultOpen>
									<Sidebar.CollapsibleTrigger
										render={
											<Sidebar.MenuButton icon={LayersIcon}>
												スコープ
												<Sidebar.MenuChevron />
											</Sidebar.MenuButton>
										}
									/>
									<Sidebar.CollapsibleContent className="mt-1">
										<Suspense fallback={<ScopeNavigationSkeleton />}>
											<ScopeNavigation site={site} year={year} />
										</Suspense>
									</Sidebar.CollapsibleContent>
								</Sidebar.Collapsible>
							</Sidebar.MenuItem>
						</Sidebar.Menu>
					</Sidebar.Group>
					<Sidebar.Separator />
					<Sidebar.Group>
						<Sidebar.Menu>
							<Sidebar.MenuButton
								active={isHome && pageTitle === "設定"}
								href="/settings"
								icon={SettingsIcon}
							>
								全体設定
							</Sidebar.MenuButton>
						</Sidebar.Menu>
					</Sidebar.Group>
					<Sidebar.Separator />
					<Sidebar.Group>
						<Sidebar.Menu>
							<Sidebar.MenuButton href="/api/v1/docs" target="_blank" icon={BookOpenIcon}>
								API ドキュメント
								<ExternalLinkIcon aria-hidden="true" className="text-kumo-subtle size-3.5" />
							</Sidebar.MenuButton>
						</Sidebar.Menu>
					</Sidebar.Group>
				</Sidebar.Content>
				<Sidebar.Footer>
					<Sidebar.Trigger aria-label="サイドバーを開閉" />
				</Sidebar.Footer>
				<Sidebar.ResizeHandle />
			</Sidebar>
			<main className="bg-kumo-canvas text-kumo-default h-svh min-w-0 flex-1 overflow-y-auto">
				<PageHeader breadcrumbs={pageHeaderContent} />
				<div>{children}</div>
			</main>
		</Sidebar.Provider>
	);
}
