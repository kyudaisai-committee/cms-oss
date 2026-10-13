import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { cmsSettings } from "#web/cms-settings";

import { DocumentTitle } from "./document-title";

describe("DocumentTitle", () => {
	it("renders the CMS title when no page title is provided", () => {
		expect(renderToStaticMarkup(createElement(DocumentTitle))).toBe(
			`<title>${cmsSettings.name}</title>`,
		);
	});

	it("renders a page title with the CMS suffix as one title string", () => {
		expect(renderToStaticMarkup(createElement(DocumentTitle, { title: "学園祭のお知らせ" }))).toBe(
			`<title>学園祭のお知らせ | ${cmsSettings.name}</title>`,
		);
	});
});
