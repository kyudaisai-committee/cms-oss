import { LinkProvider, Toasty, type LinkComponentProps } from "@cloudflare/kumo";
import { forwardRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

import type { AdminNewsDto, CreateNewsTranslationInput, ScopeRef } from "@repo/core/types";

import { NewsForm } from "../src/features/cms/components/news-form";

type CmsApiModule = typeof import("../src/features/cms/api");

const apiMocks = vi.hoisted(() => ({
	createNews: vi.fn<CmsApiModule["createNews"]>(),
	createNewsTranslation: vi.fn<CmsApiModule["createNewsTranslation"]>(),
	deleteNews: vi.fn<CmsApiModule["deleteNews"]>(),
	publishNewsTranslation: vi.fn<CmsApiModule["publishNewsTranslation"]>(),
	unpublishNewsTranslation: vi.fn<CmsApiModule["unpublishNewsTranslation"]>(),
	updateNewsParent: vi.fn<CmsApiModule["updateNewsParent"]>(),
	updateNewsTranslation: vi.fn<CmsApiModule["updateNewsTranslation"]>(),
}));

const routerMocks = vi.hoisted(() => ({
	push: vi.fn(async () => undefined),
	replace: vi.fn(async () => undefined),
}));

vi.mock("../src/features/cms/api", async (importOriginal) => ({
	...(await importOriginal<typeof import("../src/features/cms/api")>()),
	...apiMocks,
}));

vi.mock("waku", () => ({ useRouter: () => routerMocks }));

const scope: ScopeRef = { year: 2026, site: "festival" };
const missingTranslationHint =
	"この言語の翻訳はまだありません。内容を入力して保存すると追加されます。";
let currentNews: AdminNewsDto;
let cleanup: (() => void) | undefined;

function createInitialNews(): AdminNewsDto {
	return {
		id: "news-1",
		scope,
		slug: "welcome",
		title: "日本語のお知らせ",
		summary: null,
		contentType: "markdown",
		content: "日本語の本文",
		status: "published",
		publishedAt: "2026-01-01T00:00:00.000Z",
		lang: "ja",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		createdBy: "test",
		updatedBy: "test",
		tags: [],
		translations: [
			{
				id: "translation-ja",
				lang: "ja",
				title: "日本語のお知らせ",
				status: "published",
				publishedAt: "2026-01-01T00:00:00.000Z",
			},
		],
	};
}

function updateTranslation(
	input: CreateNewsTranslationInput | Parameters<CmsApiModule["updateNewsTranslation"]>[3],
	lang: string,
	status: "draft" | "published",
	publishedAt: string | null,
): AdminNewsDto {
	const existingTranslations = currentNews.translations ?? [];
	const existingTranslation = existingTranslations.find((translation) => translation.lang === lang);
	const translation = {
		id: existingTranslation?.id ?? `translation-${lang}`,
		lang,
		title: input.title,
		status,
		publishedAt,
	};
	const shared = {
		...currentNews,
		lang,
		title: input.title,
		summary: input.summary ?? null,
		status,
		publishedAt,
		updatedAt: "2026-01-02T00:00:00.000Z",
		translations: existingTranslation
			? existingTranslations.map((candidate) => (candidate.lang === lang ? translation : candidate))
			: [...existingTranslations, translation],
	};

	if ("contentType" in input && input.contentType === "link" && "content" in input) {
		currentNews = { ...shared, contentType: "link", content: input.content };
	} else if ("contentType" in input && input.contentType === "markdown" && "content" in input) {
		currentNews = { ...shared, contentType: "markdown", content: input.content };
	} else {
		currentNews =
			currentNews.contentType === "link"
				? { ...shared, contentType: "link", content: currentNews.content }
				: { ...shared, contentType: "markdown", content: currentNews.content };
	}
	return currentNews;
}

const BrowserLink = forwardRef<HTMLAnchorElement, LinkComponentProps>(function BrowserLink(
	{ children, ...props },
	ref,
) {
	return (
		<a {...props} ref={ref}>
			{children}
		</a>
	);
});

function renderNewsForm() {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);
	root.render(
		<LinkProvider component={BrowserLink}>
			<Toasty>
				<NewsForm
					availableLanguages={["ja", "en"]}
					defaultLanguage="ja"
					initialLang="en"
					news={currentNews}
					scope={scope}
					scopeName="Festival"
					tags={[]}
					translationMissing
				/>
			</Toasty>
		</LinkProvider>,
	);
	return function unmountNewsForm() {
		root.unmount();
		container.remove();
	};
}

async function fillTranslation(title: string) {
	await page.getByRole("textbox", { name: "タイトル" }).fill(title);
	await page
		.getByRole("textbox", { name: "お知らせ本文のMarkdownエディター" })
		.fill(`${title} content`);
}

async function saveTranslation() {
	await page.getByRole("button", { name: "保存" }).click();
}

async function expectDraftState() {
	const badges = page.getByText("下書き", { exact: true });
	await expect.element(badges.first()).toBeVisible();
	await expect.element(badges.last()).toBeVisible();
}

beforeEach(() => {
	currentNews = createInitialNews();
	vi.clearAllMocks();
	apiMocks.updateNewsParent.mockImplementation(async () => currentNews);
	apiMocks.createNewsTranslation.mockImplementation(async (_scope, _id, lang, input) =>
		updateTranslation(input, lang, "draft", null),
	);
	apiMocks.updateNewsTranslation.mockImplementation(async (_scope, _id, lang, input) =>
		updateTranslation(input, lang, "draft", null),
	);
	apiMocks.publishNewsTranslation.mockImplementation(async (_scope, _id, lang) => {
		const publishedAt = "2026-01-03T00:00:00.000Z";
		currentNews = {
			...currentNews,
			status: "published",
			publishedAt,
			translations: currentNews.translations?.map((translation) =>
				translation.lang === lang
					? { ...translation, status: "published", publishedAt }
					: translation,
			),
		};
		return currentNews;
	});
});

afterEach(() => {
	cleanup?.();
	cleanup = undefined;
});

it("creates the missing translation once, then saves edits with PATCH", async () => {
	cleanup = renderNewsForm();
	await expect.element(page.getByText(missingTranslationHint)).toBeVisible();

	await fillTranslation("English draft");
	await saveTranslation();
	await vi.waitFor(() => expect(apiMocks.createNewsTranslation).toHaveBeenCalledTimes(1));
	await expectDraftState();
	await expect.element(page.getByText(missingTranslationHint)).not.toBeInTheDocument();

	await fillTranslation("Updated English draft");
	await saveTranslation();
	await vi.waitFor(() => expect(apiMocks.updateNewsTranslation).toHaveBeenCalledTimes(1));

	expect(apiMocks.createNewsTranslation).toHaveBeenCalledTimes(1);
});

it("saves a missing translation as a draft and then publishes that translation", async () => {
	cleanup = renderNewsForm();
	await fillTranslation("English notice");
	await saveTranslation();
	await vi.waitFor(() => expect(apiMocks.createNewsTranslation).toHaveBeenCalledTimes(1));
	await expectDraftState();

	await page.getByRole("button", { name: "公開する" }).click();
	const dialog = page.getByRole("alertdialog");
	await expect.element(dialog).toBeVisible();
	dialog.getByRole("button", { name: "公開する" }).element().focus();
	await userEvent.keyboard("{Enter}");
	await vi.waitFor(() => expect(apiMocks.publishNewsTranslation).toHaveBeenCalledTimes(1));
	await expect.element(page.getByRole("button", { name: "公開済み" })).toBeDisabled();

	expect(apiMocks.createNewsTranslation).toHaveBeenCalledTimes(1);
	expect(apiMocks.updateNewsTranslation).toHaveBeenCalledTimes(1);
});
