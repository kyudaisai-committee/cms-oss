import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
	$getRoot,
	$getSelection,
	$isElementNode,
	$isRangeSelection,
	$isTextNode,
	type EditorState,
	type LexicalEditor,
	type LexicalNode,
	type NodeKey,
	type PointType,
} from "lexical";
import { useEffect } from "react";

import {
	$isMarkdownBoldNode,
	$isMarkdownInlineCodeNode,
	$isMarkdownItalicNode,
	$isMarkdownStrikethroughNode,
	MarkdownInlineFormatNode,
} from "#editor/inline/nodes";
import { $isMarkdownInlineMarkerNode } from "#editor/shared/marker-node";

export interface MarkdownInlineMarkerVisibility {
	markerKeys: ReadonlySet<NodeKey>;
	activeMarkerKeys: ReadonlySet<NodeKey>;
}

export function $classifyMarkdownInlineMarkerVisibility(): MarkdownInlineMarkerVisibility {
	const ownerMarkers = new Map<NodeKey, NodeKey[]>();
	const markerKeys = new Set<NodeKey>();
	$collectInlineFormatOwnerMarkers($getRoot(), ownerMarkers, markerKeys);

	const activeOwnerKeys = new Set<NodeKey>();
	const selection = $getSelection();
	if ($isRangeSelection(selection)) {
		$collectOwnerAncestors(selection.anchor.getNode(), activeOwnerKeys);
		$collectOwnerAncestors(selection.focus.getNode(), activeOwnerKeys);
		if (selection.isCollapsed()) {
			$collectCollapsedBoundaryOwners(selection.anchor, activeOwnerKeys);
		} else {
			for (const node of selection.getNodes()) {
				$collectOwnerAncestors(node, activeOwnerKeys);
			}
		}
	}

	const activeMarkerKeys = new Set<NodeKey>();
	for (const ownerKey of activeOwnerKeys) {
		for (const markerKey of ownerMarkers.get(ownerKey) ?? []) activeMarkerKeys.add(markerKey);
	}
	return { markerKeys, activeMarkerKeys } satisfies MarkdownInlineMarkerVisibility;
}

function $isMarkdownInlineFormatNode(node: LexicalNode): node is MarkdownInlineFormatNode {
	return (
		$isMarkdownBoldNode(node) ||
		$isMarkdownItalicNode(node) ||
		$isMarkdownStrikethroughNode(node) ||
		$isMarkdownInlineCodeNode(node)
	);
}

function $collectInlineFormatOwnerMarkers(
	node: LexicalNode,
	ownerMarkers: Map<NodeKey, NodeKey[]>,
	markerKeys: Set<NodeKey>,
) {
	if ($isMarkdownInlineFormatNode(node)) {
		const markers: NodeKey[] = [];
		const first = node.getFirstChild();
		const last = node.getLastChild();
		if ($isMarkdownInlineMarkerNode(first)) markers.push(first.getKey());
		if ($isMarkdownInlineMarkerNode(last) && last !== first) markers.push(last.getKey());
		if (markers.length > 0) {
			ownerMarkers.set(node.getKey(), markers);
			for (const markerKey of markers) markerKeys.add(markerKey);
		}
	}
	if (!$isElementNode(node)) return;
	for (const child of node.getChildren()) {
		$collectInlineFormatOwnerMarkers(child, ownerMarkers, markerKeys);
	}
}

function $collectOwnerAncestors(node: LexicalNode, activeOwnerKeys: Set<NodeKey>) {
	let current: LexicalNode | null = node;
	while (current) {
		if ($isMarkdownInlineFormatNode(current)) activeOwnerKeys.add(current.getKey());
		current = current.getParent();
	}
}

function $collectCollapsedBoundaryOwners(point: PointType, activeOwnerKeys: Set<NodeKey>) {
	if (point.type === "text") {
		const node = point.getNode();
		if (!$isTextNode(node)) return;
		const parent = node.getParent();
		if (!$isElementNode(parent)) return;
		if (point.offset === 0) $collectAdjacentOwner(node.getPreviousSibling(), activeOwnerKeys);
		if (point.offset === node.getTextContentSize())
			$collectAdjacentOwner(node.getNextSibling(), activeOwnerKeys);
		return;
	}

	const node = point.getNode();
	if (!$isElementNode(node)) return;
	const children = node.getChildren();
	if (point.offset > 0) $collectAdjacentOwner(children[point.offset - 1] ?? null, activeOwnerKeys);
	if (point.offset < children.length)
		$collectAdjacentOwner(children[point.offset] ?? null, activeOwnerKeys);
}

function $collectAdjacentOwner(node: LexicalNode | null, activeOwnerKeys: Set<NodeKey>) {
	if (node && $isMarkdownInlineFormatNode(node)) activeOwnerKeys.add(node.getKey());
}

function syncMarkdownInlineMarkerVisibility(
	editor: LexicalEditor,
	editorState: EditorState,
	previousMarkerKeys: Set<NodeKey>,
) {
	const visibility = editorState.read(() => $classifyMarkdownInlineMarkerVisibility());
	const allMarkerKeys = new Set([...previousMarkerKeys, ...visibility.markerKeys]);
	for (const markerKey of allMarkerKeys) {
		const element = editor.getElementByKey(markerKey);
		if (!element) continue;
		if (visibility.activeMarkerKeys.has(markerKey)) {
			element.setAttribute("data-markdown-inline-marker-active", "true");
		} else {
			element.removeAttribute("data-markdown-inline-marker-active");
		}
	}
	previousMarkerKeys.clear();
	for (const markerKey of visibility.markerKeys) previousMarkerKeys.add(markerKey);
}

export function registerMarkdownInlineMarkerVisibility(editor: LexicalEditor) {
	const previousMarkerKeys = new Set<NodeKey>();
	const removeUpdateListener = editor.registerUpdateListener(({ editorState }) => {
		syncMarkdownInlineMarkerVisibility(editor, editorState, previousMarkerKeys);
	});
	syncMarkdownInlineMarkerVisibility(editor, editor.getEditorState(), previousMarkerKeys);

	return () => {
		removeUpdateListener();
		for (const markerKey of previousMarkerKeys) {
			editor.getElementByKey(markerKey)?.removeAttribute("data-markdown-inline-marker-active");
		}
	};
}

export function MarkdownInlineMarkerVisibilityPlugin() {
	const [editor] = useLexicalComposerContext();

	useEffect(() => registerMarkdownInlineMarkerVisibility(editor), [editor]);

	return null;
}
