import { describe, expect, it } from "vitest";

import {
	createNewsFormState,
	toNewsInput,
	toNewsTranslationInput,
	toDatetimeLocal,
	validateNewsForm,
} from "./news-form-model";

describe("news form date values", () => {
	it("converts API timestamps to Japanese datetime-local values", () => {
		expect(toDatetimeLocal("2026-09-12T00:00:00.000Z")).toBe("2026-09-12T09:00");
	});

	it("converts Japanese datetime values to API timestamps", () => {
		const input = toNewsInput({
			title: "お知らせ",
			slug: "notice",
			summary: "",
			contentType: "markdown",
			content: "本文",
			tagIds: [],
			publishedAt: "2026-09-12T18:30",
			lang: "ja",
		});

		expect(input.publishedAt).toBe("2026-09-12T09:30:00.000Z");
	});

	it("accepts an empty optional publication date", () => {
		const messages = validateNewsForm({
			title: "お知らせ",
			slug: "notice",
			summary: "",
			contentType: "markdown",
			content: "本文",
			tagIds: [],
			publishedAt: "",
			lang: "ja",
		});

		expect(messages).toEqual([]);
	});

	it("validates link content with the shared Zod schema", () => {
		expect(
			validateNewsForm({
				title: "お知らせ",
				slug: "notice",
				summary: "",
				contentType: "link",
				content: "https://example.com/news",
				tagIds: [],
				publishedAt: "",
				lang: "ja",
			}),
		).toEqual([]);
		expect(
			validateNewsForm({
				title: "お知らせ",
				slug: "notice",
				summary: "",
				contentType: "link",
				content: "not-a-url",
				tagIds: [],
				publishedAt: "",
				lang: "ja",
			}),
		).toContain("内容を確認してください。");
	});

	it("handles multilingual form state and input conversion", () => {
		const jaInput = toNewsInput({
			title: "お知らせ",
			slug: "notice",
			summary: "",
			contentType: "markdown",
			content: "本文",
			tagIds: [],
			publishedAt: "",
			lang: "ja",
		});
		expect(jaInput.lang).toBe("ja");

		const enInput = toNewsInput({
			title: "Notice",
			slug: "notice",
			summary: "",
			contentType: "markdown",
			content: "Content",
			tagIds: [],
			publishedAt: "",
			lang: "en",
		});
		expect(enInput.lang).toBe("en");
	});

	it("converts translation input without shared article fields", () => {
		const input = toNewsTranslationInput({
			title: "Notice",
			slug: "notice",
			summary: "Summary",
			contentType: "markdown",
			content: "Content",
			tagIds: ["tag-1"],
			publishedAt: "",
			lang: "en",
		});

		expect(input).toEqual({
			title: "Notice",
			summary: "Summary",
			contentType: "markdown",
			content: "Content",
			publishedAt: null,
		});
	});

	it("creates initial form state with default slug and lang", () => {
		const emptyState = createNewsFormState();
		expect(emptyState.slug).toBe("");
		expect(emptyState.lang).toBe("ja");

		const customState = createNewsFormState(undefined, { slug: "custom-slug", lang: "en" });
		expect(customState.slug).toBe("custom-slug");
		expect(customState.lang).toBe("en");
	});
});
