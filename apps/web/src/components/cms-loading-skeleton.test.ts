import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
	NewsFormSkeleton,
	NewsListSkeleton,
	ScopeNavigationSkeleton,
	ScopeSelectorSkeleton,
} from "./cms-loading-skeleton";

describe("CMS loading skeletons", () => {
	it("keeps the news list layout while data is loading", () => {
		const markup = renderToStaticMarkup(createElement(NewsListSkeleton));

		expect(markup).toContain('role="status"');
		expect(markup).toContain('aria-label="お知らせを読み込み中"');
		expect(markup).toContain("お知らせを読み込み中");
		expect(markup.match(/skeleton-line/g)?.length).toBeGreaterThan(10);
	});

	it("keeps the news form card structure while data is loading", () => {
		const markup = renderToStaticMarkup(createElement(NewsFormSkeleton));

		expect(markup).toContain('role="status"');
		expect(markup).toContain('aria-label="お知らせフォームを読み込み中"');
		expect(markup.match(/ring-kumo-line/g)?.length).toBe(2);
		expect(markup).toContain("skeleton-line");
	});

	it("keeps the home scope selector structure while scopes are loading", () => {
		const markup = renderToStaticMarkup(createElement(ScopeSelectorSkeleton));

		expect(markup).toContain('role="status"');
		expect(markup).toContain('aria-label="スコープを読み込み中"');
		expect(markup.match(/skeleton-line/g)?.length).toBeGreaterThan(10);
		expect(markup.match(/ring-kumo-line/g)?.length).toBe(4);
	});

	it("keeps the sidebar scope list shape while scopes are loading", () => {
		const markup = renderToStaticMarkup(createElement(ScopeNavigationSkeleton));

		expect(markup).toContain('data-sidebar="menu-sub"');
		expect(markup).toContain('role="status"');
		expect(markup).toContain('aria-label="スコープを読み込み中"');
		expect(markup).toContain("height:34px");
		expect(markup).not.toContain("h-2.5");
		expect(markup).not.toContain("w-28");
		expect(markup.match(/skeleton-line/g)?.length).toBe(3);
	});
});
