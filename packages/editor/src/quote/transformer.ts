import { QUOTE } from "@lexical/markdown";
import type { ElementTransformer } from "@lexical/markdown";
import { $isQuoteNode, QuoteNode } from "@lexical/rich-text";
import type { LexicalNode } from "lexical";

export const MARKDOWN_QUOTE_TRANSFORMER = {
	dependencies: [QuoteNode],
	export: (node: LexicalNode, exportChildren) => {
		if (!$isQuoteNode(node)) return null;
		const lines = exportChildren(node).split("\n");
		return lines
			.map((line) => (line.startsWith("> ") ? line.slice(2) : line))
			.map((line) => `> ${line}`)
			.join("\n");
	},
	regExp: QUOTE.regExp,
	replace: QUOTE.replace,
	triggerOnEnter: QUOTE.triggerOnEnter ?? false,
	type: "element",
} satisfies ElementTransformer;
