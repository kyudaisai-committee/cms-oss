import { describe, expect, it } from "vitest";

import { buildNewsListHref, parseNewsListQuery } from "./news-list-query";

describe("news list URL query", () => {
	it("parses a directly opened filtered page", () => {
		const query = parseNewsListQuery(
			new URLSearchParams("page=3&search=%20festival%20&lang=en&tag=important"),
		);

		expect(query).toEqual({
			page: 3,
			search: "festival",
			lang: "en",
			tag: "important",
		});
	});

	it("starts invalid or first-page URLs at page one", () => {
		expect(parseNewsListQuery(new URLSearchParams("page=0&search=notice"))).toEqual({
			page: 1,
			search: "notice",
		});
	});

	it("builds a history entry with filters and a requested page", () => {
		const href = buildNewsListHref(
			{ year: 2026, site: "festival" },
			{ page: 4, search: "festival notice", lang: "en", tag: "important" },
		);

		expect(href).toBe("/2026/festival?search=festival+notice&lang=en&tag=important&page=4");
	});

	it("omits the page parameter for the first page", () => {
		expect(buildNewsListHref({ year: 2026, site: "festival" }, { page: 1, search: "" })).toBe(
			"/2026/festival",
		);
	});
});
