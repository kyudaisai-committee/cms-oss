import { LinkNode } from "@lexical/link";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $isParagraphNode, ParagraphNode, TextNode, type LexicalEditor } from "lexical";
import { useEffect } from "react";

import { $reconcileMarkdownParagraph } from "#editor/paragraph/reconcile";
import { $getTopLevelMarkdownBlock } from "#editor/shared/block-source";

export function registerMarkdownParagraphReconciler(editor: LexicalEditor) {
	const removeTextTransform = editor.registerNodeTransform(TextNode, (node) => {
		const block = $getTopLevelMarkdownBlock(node);
		if (!$isParagraphNode(block)) return;
		$reconcileMarkdownParagraph(block);
	});
	const removeParagraphTransform = editor.registerNodeTransform(
		ParagraphNode,
		$reconcileMarkdownParagraph,
	);
	const removeLinkTransform = editor.registerNodeTransform(LinkNode, (node) => {
		const block = $getTopLevelMarkdownBlock(node);
		if (!$isParagraphNode(block)) return;
		$reconcileMarkdownParagraph(block);
	});

	return () => {
		removeTextTransform();
		removeParagraphTransform();
		removeLinkTransform();
	};
}

export function MarkdownParagraphReconcilePlugin() {
	const [editor] = useLexicalComposerContext();

	useEffect(() => registerMarkdownParagraphReconciler(editor), [editor]);

	return null;
}
