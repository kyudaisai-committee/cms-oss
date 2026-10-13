import { HEADING } from "@lexical/markdown";
import type { ElementTransformer } from "@lexical/markdown";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $isHeadingNode, HeadingNode } from "@lexical/rich-text";
import {
	$getRoot,
	$getSelection,
	$isElementNode,
	$isRangeSelection,
	type EditorState,
	type LexicalEditor,
	type LexicalNode,
	type NodeKey,
} from "lexical";
import { useEffect } from "react";

import { registerMarkdownHeadingReconciler } from "#editor/heading/reconcile";
import {
	$isMarkdownInlineMarkerNode,
	type MarkdownInlineMarkerNode,
} from "#editor/shared/marker-node";

export function $isHeadingMarker(
	node: LexicalNode | null | undefined,
): node is MarkdownInlineMarkerNode {
	return $isMarkdownInlineMarkerNode(node) && node.getMarkerSide() === "prefix";
}

function $collectHeadingMarkerKeys(node: LexicalNode, keys: Set<NodeKey>) {
	if ($isHeadingNode(node)) {
		const firstChild = node.getFirstChild();
		if ($isHeadingMarker(firstChild)) keys.add(firstChild.getKey());
	}
	if (!$isElementNode(node)) return;
	for (const child of node.getChildren()) $collectHeadingMarkerKeys(child, keys);
}

function $getSelectedHeadingMarkerKey(editorState: EditorState) {
	let selectedKey: NodeKey | null = null;
	editorState.read(() => {
		const selection = $getSelection();
		if (!$isRangeSelection(selection)) return;
		for (const point of [selection.anchor, selection.focus]) {
			let node: LexicalNode | null = point.getNode();
			while (node) {
				if ($isHeadingNode(node)) {
					const firstChild = node.getFirstChild();
					if ($isHeadingMarker(firstChild)) selectedKey = firstChild.getKey();
					break;
				}
				node = node.getParent();
			}
			if (selectedKey) break;
		}
	});
	return selectedKey;
}

function $getHeadingMarkerKeys(editorState: EditorState) {
	const keys = new Set<NodeKey>();
	editorState.read(() => {
		$collectHeadingMarkerKeys($getRoot(), keys);
	});
	return keys;
}

function $syncHeadingMarkerDOM(
	editor: LexicalEditor,
	editorState: EditorState,
	previousKeys: Set<NodeKey>,
) {
	const nextKeys = $getHeadingMarkerKeys(editorState);
	const selectedKey = $getSelectedHeadingMarkerKey(editorState);
	const allKeys = new Set([...previousKeys, ...nextKeys]);
	for (const key of allKeys) {
		const element = editor.getElementByKey(key);
		if (!element) continue;
		if (!nextKeys.has(key)) {
			element.removeAttribute("data-markdown-heading-marker");
			element.removeAttribute("data-markdown-heading-marker-active");
			continue;
		}
		element.setAttribute("data-markdown-heading-marker", "true");
		if (key === selectedKey) element.setAttribute("data-markdown-heading-marker-active", "true");
		else element.removeAttribute("data-markdown-heading-marker-active");
	}
	previousKeys.clear();
	for (const key of nextKeys) previousKeys.add(key);
}

export const MARKDOWN_HEADING_TRANSFORMER = {
	dependencies: [HeadingNode],
	export: (node: LexicalNode, exportChildren) => {
		if (!$isHeadingNode(node)) return null;
		const marker = node.getFirstChild();
		const markerText = $isHeadingMarker(marker) ? marker.getTextContent() : "";
		const content = exportChildren(node);
		const body =
			markerText && content.startsWith(markerText) ? content.slice(markerText.length) : content;
		return "#".repeat(Number(node.getTag().slice(1))) + " " + body;
	},
	regExp: HEADING.regExp,
	replace: HEADING.replace,
	triggerOnEnter: HEADING.triggerOnEnter ?? false,
	type: "element",
} satisfies ElementTransformer;

export function HeadingMarkerPlugin() {
	const [editor] = useLexicalComposerContext();

	useEffect(() => {
		const markerKeys = new Set<NodeKey>();
		const $syncDOM = (editorState: EditorState) => {
			$syncHeadingMarkerDOM(editor, editorState, markerKeys);
		};
		const removeHeadingReconciler = registerMarkdownHeadingReconciler(editor);
		const removeUpdateListener = editor.registerUpdateListener(({ editorState }) => {
			$syncDOM(editorState);
		});
		$syncDOM(editor.getEditorState());

		return () => {
			removeHeadingReconciler();
			removeUpdateListener();
			for (const key of markerKeys) {
				const element = editor.getElementByKey(key);
				element?.removeAttribute("data-markdown-heading-marker");
				element?.removeAttribute("data-markdown-heading-marker-active");
			}
		};
	}, [editor]);

	return null;
}
