import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

import type { NewsContentType } from "@repo/core/types";

const markdownProcessor = unified()
	.use(remarkParse)
	.use(remarkGfm)
	.use(remarkRehype)
	.use(rehypeSanitize)
	.use(rehypeStringify);

type ContentRenderer = (source: string) => string;

function renderMarkdown(source: Parameters<ContentRenderer>[0]): ReturnType<ContentRenderer> {
	return String(markdownProcessor.processSync(source));
}

const rendererRegistry: Partial<Record<NewsContentType, ContentRenderer>> = {
	markdown: renderMarkdown,
};

export type RenderedNewsContent =
	| {
			contentType: "markdown";
			supported: true;
			html: string;
	  }
	| {
			contentType: "link";
			supported: true;
			href: string;
	  };

export function renderNewsContent(
	contentType: NewsContentType,
	source: string,
): RenderedNewsContent {
	if (contentType === "link") return { contentType, supported: true, href: source };
	const renderer = rendererRegistry[contentType];

	if (!renderer) return { contentType, supported: true, html: "" };

	return { contentType, supported: true, html: renderer(source) };
}
