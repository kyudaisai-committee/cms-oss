import { describe, expect, it } from "vitest";

import { renderNewsContent } from "./renderer";

describe("news content preview", () => {
	it("renders markdown content", () => {
		expect(renderNewsContent("markdown", "# 見出し")).toMatchObject({
			contentType: "markdown",
			supported: true,
			html: "<h1>見出し</h1>",
		});
	});

	it("returns a link target for link content", () => {
		expect(renderNewsContent("link", "https://example.com/news")).toEqual({
			contentType: "link",
			supported: true,
			href: "https://example.com/news",
		});
	});
});
