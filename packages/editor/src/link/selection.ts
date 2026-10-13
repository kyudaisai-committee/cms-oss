import { $isLinkNode } from "@lexical/link";
import type { LinkNode } from "@lexical/link";
import {
	$isElementNode,
	$isTextNode,
	type LexicalNode,
	type NodeKey,
	type PointType,
	type RangeSelection,
} from "lexical";

import { $isStructuredLink } from "#editor/link/model";

function $findLinkAncestor(node: LexicalNode): LinkNode | null {
	let current: LexicalNode | null = node;
	while (current) {
		if ($isLinkNode(current)) return current;
		current = current.getParent();
	}
	return null;
}

export function $findLinkNodeFromSelection(selection: RangeSelection): LinkNode | null {
	const anchorLink = $findLinkAncestor(selection.anchor.getNode());
	const focusLink = $findLinkAncestor(selection.focus.getNode());
	return anchorLink && focusLink?.getKey() === anchorLink.getKey() ? anchorLink : null;
}

function $collectLinkAncestors(node: LexicalNode, activeKeys: Set<NodeKey>) {
	const link = $findLinkAncestor(node);
	if (link && $isStructuredLink(link)) activeKeys.add(link.getKey());
}

function $collectAdjacentLink(node: LexicalNode | null, activeKeys: Set<NodeKey>) {
	if (node && $isLinkNode(node) && $isStructuredLink(node)) {
		activeKeys.add(node.getKey());
	}
}

function $collectCollapsedBoundaryLinks(point: PointType, activeKeys: Set<NodeKey>) {
	if (point.type === "text") {
		const node = point.getNode();
		if (!$isTextNode(node)) return;
		const parent = node.getParent();
		if (!$isElementNode(parent)) return;
		if (point.offset === 0) $collectAdjacentLink(node.getPreviousSibling(), activeKeys);
		if (point.offset === node.getTextContentSize())
			$collectAdjacentLink(node.getNextSibling(), activeKeys);
		return;
	}

	const node = point.getNode();
	if (!$isElementNode(node)) return;
	const children = node.getChildren();
	if (point.offset > 0) $collectAdjacentLink(children[point.offset - 1] ?? null, activeKeys);
	if (point.offset < children.length)
		$collectAdjacentLink(children[point.offset] ?? null, activeKeys);
}

export function $collectActiveStructuredLinkKeys(
	selection: RangeSelection,
	activeKeys: Set<NodeKey>,
) {
	$collectLinkAncestors(selection.anchor.getNode(), activeKeys);
	$collectLinkAncestors(selection.focus.getNode(), activeKeys);
	if (selection.isCollapsed()) {
		$collectCollapsedBoundaryLinks(selection.anchor, activeKeys);
	} else {
		for (const node of selection.getNodes()) {
			$collectLinkAncestors(node, activeKeys);
		}
	}
}
