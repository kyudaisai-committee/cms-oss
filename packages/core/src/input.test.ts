import { describe, expect, it } from "vitest";

import {
	normalizeCreateNewsInput,
	normalizeCreateTagInput,
	normalizeEnsureScopeInput,
	normalizeLang,
	normalizeScopeLanguages,
} from "./input";

describe("CMS input normalization", () => {
	it("normalizes slugs and removes duplicate tags", () => {
		expect(
			normalizeCreateNewsInput({
				slug: " Hello-World ",
				title: " Title ",
				contentType: "markdown",
				content: " body ",
				tagIds: ["a", "a"],
			}),
		).toMatchObject({
			slug: "hello-world",
			title: "Title",
			contentType: "markdown",
			content: "body",
			tagIds: ["a"],
		});
	});

	it("normalizes and validates link content through the shared schema", () => {
		expect(
			normalizeCreateNewsInput({
				slug: "link",
				title: "Link",
				contentType: "link",
				content: " https://example.com/news ",
			}),
		).toMatchObject({ contentType: "link", content: "https://example.com/news" });
		expect(() =>
			normalizeCreateNewsInput({
				slug: "link",
				title: "Link",
				contentType: "link",
				content: "not-a-url",
			}),
		).toThrow();
	});

	it("rejects invalid slugs", () => {
		expect(() => normalizeCreateTagInput({ name: "News", slug: "not valid" })).toThrow();
	});

	it("canonicalizes arbitrary BCP 47 language tags", () => {
		expect(normalizeLang(" zh-hant ")).toBe("zh-Hant");
		expect(normalizeScopeLanguages(["ja", "ZH-hant"], "zh-hant")).toEqual({
			availableLanguages: ["ja", "zh-Hant"],
			defaultLanguage: "zh-Hant",
		});
	});

	it("rejects an invalid or unavailable default language", () => {
		expect(() => normalizeLang("en_US")).toThrow();
		expect(() => normalizeScopeLanguages(["ja", "en"], "fr")).toThrow();
	});

	it("keeps the normalized default language when ensuring a scope", () => {
		expect(
			normalizeEnsureScopeInput({
				name: "Festival",
				availableLanguages: ["ja", "zh-hant"],
				defaultLanguage: "zh-hant",
			}),
		).toEqual({
			name: "Festival",
			availableLanguages: ["ja", "zh-Hant"],
			defaultLanguage: "zh-Hant",
		});
	});
});
