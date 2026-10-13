import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

export function createMarkdownProcessor() {
	return unified().use(remarkParse).use(remarkGfm);
}

export function parseMarkdown(source: string) {
	return createMarkdownProcessor().parse(source);
}
