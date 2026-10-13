import { $createCodeNode, $isCodeNode } from "@lexical/code";
import { CODE } from "@lexical/markdown";
import type { MultilineElementTransformer } from "@lexical/markdown";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
	$getSelection,
	$isParagraphNode,
	$isRangeSelection,
	ParagraphNode,
	TextNode,
	type LexicalEditor,
	type LexicalNode,
} from "lexical";
import { useEffect } from "react";

import { $getMarkdownBlockRawSource, $getTopLevelMarkdownBlock } from "#editor/shared/block-source";

function $replaceEmptyFenceParagraph(paragraph: ParagraphNode, text: TextNode) {
	const selection = $getSelection();
	if (
		!$isRangeSelection(selection) ||
		!selection.isCollapsed() ||
		selection.anchor.getNode() !== text ||
		selection.anchor.offset !== text.getTextContentSize()
	) {
		return false;
	}

	const code = $createCodeNode();
	paragraph.replace(code);
	code.select(0, 0);
	return true;
}

function $reconcileMarkdownCodeBlockShortcut(node: TextNode) {
	const block = $getTopLevelMarkdownBlock(node);
	if (
		!$isParagraphNode(block) ||
		node.getParent() !== block ||
		$getMarkdownBlockRawSource(block) !== "```"
	) {
		return;
	}
	$replaceEmptyFenceParagraph(block, node);
}

export function registerMarkdownCodeBlockShortcut(editor: LexicalEditor) {
	return editor.registerNodeTransform(TextNode, $reconcileMarkdownCodeBlockShortcut);
}

export const MARKDOWN_CODE_FENCE_TRANSFORMER = {
	...CODE,
	export: (node: LexicalNode) =>
		$isCodeNode(node) ? (CODE.export?.(node, (element) => element.getTextContent()) ?? null) : null,
} satisfies MultilineElementTransformer;

export function MarkdownCodeBlockShortcutPlugin() {
	const [editor] = useLexicalComposerContext();

	useEffect(() => registerMarkdownCodeBlockShortcut(editor), [editor]);

	return null;
}
