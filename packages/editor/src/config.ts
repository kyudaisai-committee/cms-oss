import { CodeNode } from "@lexical/code";
import { LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import { $convertFromMarkdownString, CODE, HEADING, QUOTE, TRANSFORMERS } from "@lexical/markdown";
import type { Transformer } from "@lexical/markdown";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import {
	$createParagraphNode,
	$getRoot,
	$isParagraphNode,
	type InitialEditorConfig,
	type EditorThemeClasses,
} from "lexical";

import { MARKDOWN_CODE_FENCE_TRANSFORMER } from "#editor/code-block/plugin";
import { $reconcileMarkdownHeadingParagraph } from "#editor/heading/reconcile";
import {
	MarkdownBoldNode,
	MarkdownInlineCodeNode,
	MarkdownItalicNode,
	MarkdownStrikethroughNode,
} from "#editor/inline/nodes";
import { $reconcileMarkdownParagraph } from "#editor/paragraph/reconcile";
import { $reconcileMarkdownQuoteParagraph } from "#editor/quote/reconcile";
import { MarkdownInlineMarkerNode } from "#editor/shared/marker-node";
import { tw } from "#editor/shared/utils";

export const editorTheme = tw({
	code: "bg-kumo-tint not-prose my-2 block overflow-x-auto rounded-md p-3 font-mono text-sm whitespace-pre-wrap before:content-none after:content-none",
	heading: {
		h2: "mt-4 mb-2 text-xl font-semibold first:mt-0",
		h3: "mt-3 mb-1 text-lg font-semibold first:mt-0",
	},
	link: "text-kumo-link underline underline-offset-2",
	list: {
		listitem: "my-1",
		nested: {
			listitem: "list-none",
		},
		ol: "my-2 list-decimal pl-6",
		ul: "my-2 list-disc pl-6",
	},
	paragraph: "mb-2 last:mb-0",
	quote: "border-kumo-line text-kumo-subtle my-2 border-l-2 pl-4 italic",
	text: {
		bold: "font-semibold",
		code: "bg-kumo-tint rounded px-1 py-0.5 font-mono text-[0.9em]",
		italic: "italic",
		strikethrough: "line-through",
	},
}) satisfies EditorThemeClasses;

const markdownImportTransformers = [
	MARKDOWN_CODE_FENCE_TRANSFORMER,
	...TRANSFORMERS.filter(
		(transformer) =>
			transformer !== CODE &&
			transformer !== HEADING &&
			transformer !== QUOTE &&
			transformer.type !== "text-format" &&
			transformer.type !== "text-match",
	),
] satisfies Transformer[];

export function createEditorConfig(initialMarkdown: string): InitialEditorConfig {
	return {
		namespace: "MarkdownEditor",
		nodes: [
			HeadingNode,
			QuoteNode,
			ListNode,
			ListItemNode,
			CodeNode,
			LinkNode,
			MarkdownBoldNode,
			MarkdownItalicNode,
			MarkdownStrikethroughNode,
			MarkdownInlineCodeNode,
			MarkdownInlineMarkerNode,
		],
		theme: editorTheme,
		$initialEditorState: () => {
			$convertFromMarkdownString(initialMarkdown, markdownImportTransformers);
			const root = $getRoot();
			for (const child of root.getChildren()) {
				if (!$isParagraphNode(child)) continue;
				if ($reconcileMarkdownHeadingParagraph(child)) continue;
				if ($reconcileMarkdownQuoteParagraph(child)) continue;
				$reconcileMarkdownParagraph(child);
			}
			if (root.isEmpty()) root.append($createParagraphNode());
		},
		onError: (error: Error) => {
			throw error;
		},
	};
}
