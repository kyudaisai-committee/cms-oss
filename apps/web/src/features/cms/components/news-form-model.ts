import { TZDate, tz } from "@date-fns/tz";
import { format, isValid, parse, parseISO } from "date-fns";

import {
	newsContentSchema,
	createNewsInputSchema,
	type AdminNewsDto,
	type CreateNewsTranslationInput,
	type NewsContentType,
	type CreateNewsInput,
} from "@repo/core/types";

import type { NewsFormState } from "../store";

const japanTimeZone = "Asia/Tokyo";
const japanTimeZoneContext = tz(japanTimeZone);
const japanDateTimeFormat = "yyyy-MM-dd'T'HH:mm";
const japanReferenceDate = new TZDate(0, japanTimeZone);

export function toDatetimeLocal(value: string | null | undefined): string {
	if (!value) return "";
	const date = parseISO(value);
	if (!isValid(date)) return "";
	return format(date, japanDateTimeFormat, { in: japanTimeZoneContext });
}

export function createNewsFormState(
	news?: AdminNewsDto,
	defaults?: { slug?: string | undefined; lang?: string | undefined; blank?: boolean | undefined },
): NewsFormState {
	return {
		title: defaults?.blank ? "" : (news?.title ?? ""),
		slug: news?.slug ?? defaults?.slug ?? "",
		summary: defaults?.blank ? "" : (news?.summary ?? ""),
		contentType: defaults?.blank ? "markdown" : (news?.contentType ?? "markdown"),
		content: defaults?.blank ? "" : (news?.content ?? ""),
		tagIds: news?.tags.map((tag) => tag.id) ?? [],
		publishedAt: defaults?.blank ? "" : toDatetimeLocal(news?.publishedAt),
		lang: news?.lang ?? defaults?.lang ?? "ja",
	};
}

export function toNewsInput(values: NewsFormState): CreateNewsInput {
	let isoPublishedAt: string | null = null;
	if (values.publishedAt) {
		const parsed = parse(values.publishedAt, japanDateTimeFormat, japanReferenceDate, {
			in: japanTimeZoneContext,
		});
		if (isValid(parsed)) {
			isoPublishedAt = new Date(parsed.getTime()).toISOString();
		}
	}

	const content =
		values.contentType === "markdown"
			? { contentType: "markdown" as const, content: values.content }
			: { contentType: "link" as const, content: values.content };

	return {
		title: values.title.trim(),
		slug: values.slug.trim().toLowerCase(),
		summary: values.summary.trim() || null,
		...content,
		tagIds: values.tagIds,
		publishedAt: isoPublishedAt,
		lang: (values.lang || "ja").trim(),
	};
}

export function toNewsTranslationInput(values: NewsFormState): CreateNewsTranslationInput {
	const input = toNewsInput(values);
	return input.contentType === "markdown"
		? {
				title: input.title,
				summary: input.summary,
				contentType: "markdown",
				content: input.content,
				publishedAt: input.publishedAt,
			}
		: {
				title: input.title,
				summary: input.summary,
				contentType: "link",
				content: input.content,
				publishedAt: input.publishedAt,
			};
}

export function validateNewsForm(values: NewsFormState): string[] {
	const messages: string[] = [];
	const input = toNewsInput(values);
	const parsedInput = createNewsInputSchema.safeParse(input);
	if (!parsedInput.success) {
		for (const issue of parsedInput.error.issues) {
			if (issue.path[0] === "title") messages.push("タイトルを入力してください。");
			else if (issue.path[0] === "slug")
				messages.push("スラッグは半角英数字とハイフンで入力してください。");
			else if (issue.path[0] === "content") messages.push("内容を確認してください。");
			else if (issue.path[0] === "contentType") messages.push("内容種別を選択してください。");
			else if (issue.path[0] === "lang") messages.push("言語コードを確認してください。");
		}
	}
	if (values.publishedAt) {
		const parsed = parse(values.publishedAt, japanDateTimeFormat, japanReferenceDate, {
			in: japanTimeZoneContext,
		});
		if (
			!isValid(parsed) ||
			format(parsed, japanDateTimeFormat, { in: japanTimeZoneContext }) !== values.publishedAt
		) {
			messages.push("公開日時を確認してください。");
		}
	}
	return messages;
}

export function validateNewsContent(
	contentType: NewsContentType,
	content: string,
): string | undefined {
	return newsContentSchema.safeParse({ contentType, content }).success
		? undefined
		: "内容を確認してください。";
}
