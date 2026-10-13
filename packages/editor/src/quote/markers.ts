import { $isQuoteNode } from "@lexical/rich-text";
import {
	$getNodeByKey,
	$getRoot,
	$getSelection,
	$isElementNode,
	$isLineBreakNode,
	$isRangeSelection,
	type EditorState,
	type LexicalEditor,
	type LexicalNode,
	type NodeKey,
} from "lexical";

import {
	$isMarkdownInlineMarkerNode,
	type MarkdownInlineMarkerNode,
} from "#editor/shared/marker-node";

export function $isQuoteMarker(
	node: LexicalNode | null | undefined,
): node is MarkdownInlineMarkerNode {
	if (!$isMarkdownInlineMarkerNode(node) || node.getMarkerSide() !== "prefix") return false;
	const parent = node.getParent();
	if (!$isQuoteNode(parent)) return false;
	const previousSibling = node.getPreviousSibling();
	return previousSibling === null || $isLineBreakNode(previousSibling);
}

function $collectQuoteMarkerKeys(node: LexicalNode, keys: Set<NodeKey>) {
	if ($isQuoteMarker(node)) keys.add(node.getKey());
	if (!$isElementNode(node)) return;
	for (const child of node.getChildren()) $collectQuoteMarkerKeys(child, keys);
}

function $getSelectedQuoteKey(editorState: EditorState) {
	let selectedQuoteKey: NodeKey | null = null;
	editorState.read(() => {
		const selection = $getSelection();
		if (!$isRangeSelection(selection)) return;
		for (const point of [selection.anchor, selection.focus]) {
			let node: LexicalNode | null = point.getNode();
			while (node) {
				if ($isQuoteNode(node)) {
					selectedQuoteKey = node.getKey();
					break;
				}
				node = node.getParent();
			}
			if (selectedQuoteKey) break;
		}
	});
	return selectedQuoteKey;
}

function $getQuoteMarkerKeys(editorState: EditorState) {
	const markerKeys = new Set<NodeKey>();
	const activeMarkerKeys = new Set<NodeKey>();
	const selectedQuoteKey = $getSelectedQuoteKey(editorState);
	editorState.read(() => {
		const root = $getRoot();
		$collectQuoteMarkerKeys(root, markerKeys);
		if (!selectedQuoteKey) return;
		const selectedQuote = $getNodeByKey(selectedQuoteKey);
		if ($isQuoteNode(selectedQuote)) $collectQuoteMarkerKeys(selectedQuote, activeMarkerKeys);
	});
	return { activeMarkerKeys, markerKeys };
}

export function $syncQuoteMarkerDOM(
	editor: LexicalEditor,
	editorState: EditorState,
	previousKeys: Set<NodeKey>,
) {
	const { activeMarkerKeys, markerKeys } = $getQuoteMarkerKeys(editorState);
	const allKeys = new Set([...previousKeys, ...markerKeys]);
	for (const key of allKeys) {
		const element = editor.getElementByKey(key);
		if (!element) continue;
		if (!markerKeys.has(key)) {
			element.removeAttribute("data-markdown-quote-marker");
			element.removeAttribute("data-markdown-quote-marker-active");
			continue;
		}
		element.setAttribute("data-markdown-quote-marker", "true");
		if (activeMarkerKeys.has(key)) {
			element.setAttribute("data-markdown-quote-marker-active", "true");
		} else {
			element.removeAttribute("data-markdown-quote-marker-active");
		}
	}
	previousKeys.clear();
	for (const key of markerKeys) previousKeys.add(key);
}
