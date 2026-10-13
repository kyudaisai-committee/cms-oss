import { LinkProvider, type LinkComponentProps } from "@cloudflare/kumo";
import { Provider, createStore } from "jotai";
import { createElement, forwardRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { cmsSettings } from "#web/cms-settings";
import { availableScopesAtom } from "#web/features/cms/store";

import { CmsShell } from "./cms-shell";
import { ThemeProvider } from "./theme-provider";

interface NavigationLink {
	href: string;
	active: boolean;
}

function createTestLink(navigation: NavigationLink[]) {
	return forwardRef<HTMLAnchorElement, LinkComponentProps>(function TestLink(
		{ href, ...props },
		ref,
	) {
		if (href) {
			const active = "data-active" in props && props["data-active"] === true;
			navigation.push({ active, href });
		}
		return createElement("a", { ...props, href, ref });
	});
}

const scopes = [
	{
		id: "festival-2026",
		year: 2026,
		site: "festival" as const,
		name: "スコープ1",
		availableLanguages: ["ja", "en"],
		defaultLanguage: "ja",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
	},
];

function renderShell(props: { year?: number; site?: string; pageTitle?: string } = {}) {
	const navigation: NavigationLink[] = [];
	const store = createStore();
	store.set(availableScopesAtom, scopes);
	const shell = createElement(CmsShell, { ...props, children: "コンテンツ" });
	const provider = createElement(Provider, { store, children: shell });
	const themeProvider = createElement(ThemeProvider, { children: provider });
	const markup = renderToStaticMarkup(
		createElement(LinkProvider, {
			component: createTestLink(navigation),
			children: themeProvider,
		}),
	);
	return { markup, navigation };
}

function linkForHref(navigation: NavigationLink[], href: string) {
	return navigation.find((link) => link.href === href);
}

describe("CmsShell layout", () => {
	it("puts navigation and actions in the intended sidebar regions", () => {
		const { markup } = renderShell();

		expect(markup).toContain('data-sidebar="content"');
		expect(markup).toContain('data-sidebar="footer"');
		expect(markup).toContain("API ドキュメント");
		expect(markup).toContain(cmsSettings.name);
		expect(markup).toContain('aria-label="テーマ: システム');
		expect(markup).not.toContain("表示テーマ: システム");
		const footerStart = markup.indexOf('data-sidebar="footer"');
		const triggerStart = markup.indexOf('data-sidebar="trigger"', footerStart);
		const menuButtonAfterFooter = markup.indexOf('data-sidebar="menu-button"', footerStart);
		const contentStart = markup.indexOf('data-sidebar="content"');
		const footerContent = markup.slice(contentStart, footerStart);
		expect(triggerStart).toBeGreaterThan(footerStart);
		expect(menuButtonAfterFooter).toBe(-1);
		expect(footerContent).not.toContain("表示テーマ");
	});

	it("renders scope navigation and breadcrumbs only on scope routes", () => {
		const { markup: homeMarkup } = renderShell();
		const { markup: scopeMarkup } = renderShell({
			pageTitle: "お知らせ編集",
			site: "festival",
			year: 2026,
		});

		expect(homeMarkup).not.toContain('aria-label="breadcrumb"');
		expect(scopeMarkup).toContain('aria-label="breadcrumb"');
		expect(scopeMarkup).toContain("スコープ1");
		expect(scopeMarkup).toContain('data-sidebar="menu-sub"');
		expect(scopeMarkup).toContain("お知らせ編集");
	});

	it("keeps global settings fixed and scope settings out of the shared navigation", () => {
		const home = renderShell();
		const scopePage = renderShell({ site: "festival", year: 2026 });
		const globalSettings = renderShell({ pageTitle: "設定" });
		const scopeSettings = renderShell({ pageTitle: "設定", site: "festival", year: 2026 });
		const settingsHref = "/2026/festival/settings";

		for (const page of [home, scopePage, globalSettings, scopeSettings]) {
			expect(linkForHref(page.navigation, "/settings")?.href).toBe("/settings");
			expect(linkForHref(page.navigation, settingsHref)).toBeUndefined();
		}

		expect(linkForHref(globalSettings.navigation, "/settings")?.active).toBe(true);
		expect(globalSettings.navigation.some((link) => link.href === "/" && link.active)).toBe(false);
		expect(linkForHref(scopeSettings.navigation, "/settings")?.active).toBe(false);
		expect(linkForHref(scopeSettings.navigation, "/2026/festival")?.active).toBe(true);
		expect(home.navigation.some((link) => link.href === "/" && link.active)).toBe(true);
	});
});
