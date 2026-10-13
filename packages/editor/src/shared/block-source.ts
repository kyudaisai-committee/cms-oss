import { $isAutoLinkNode, $isLinkNode, type LinkNode } from "@lexical/link";
import {
	$createTextNode,
	$isElementNode,
	$isLineBreakNode,
	$isRangeSelection,
	$isRootOrShadowRoot,
	$isTextNode,
	type ElementNode,
	type LexicalNode,
	type PointType,
	type RangeSelection,
} from "lexical";

import { $isStructuredLink } from "#editor/link/model";
import { $isMarkdownInlineMarkerNode } from "#editor/shared/marker-node";

export interface MarkdownBlockSelectionSnapshot {
	block: ElementNode;
	anchorOffset: number;
	focusOffset: number;
	isBackward: boolean;
}

export interface MarkdownBlockNodeRange {
	start: number;
	end: number;
}

function $getRawSource(node: LexicalNode): string {
	if ($isLineBreakNode(node)) return "\n";
	if ($isTextNode(node)) return node.getTextContent();
	if ($isLinkNode(node)) {
		const label = node.getChildren().map($getRawSource).join("");
		if ($isAutoLinkNode(node) || !$isMarkdownSourceLink(node)) return label;
		return `[${label}](${node.getURL()})`;
	}
	if (!$isElementNode(node)) return "";
	return node.getChildren().map($getRawSource).join("");
}

export function $isMarkdownSourceLink(node: LexicalNode): node is LinkNode {
	return (
		$isLinkNode(node) &&
		!$isAutoLinkNode(node) &&
		!$isStructuredLink(node) &&
		!node.getChildren().some($isMarkdownInlineMarkerNode)
	);
}

function $isDescendantOf(block: ElementNode, node: LexicalNode): boolean {
	let current: LexicalNode | null = node;
	while (current) {
		if (current === block) return true;
		current = current.getParent();
	}
	return false;
}

function $getRawSourceLengthBeforeChild(parent: ElementNode, child: LexicalNode): number | null {
	const index = child.getIndexWithinParent();
	if (index < 0) return null;
	return (
		parent
			.getChildren()
			.slice(0, index)
			.reduce((length, sibling) => length + $getRawSource(sibling).length, 0) +
		($isMarkdownSourceLink(parent) ? 1 : 0)
	);
}

export function $getTopLevelMarkdownBlock(node: LexicalNode | null): ElementNode | null {
	let current = node;
	while (current) {
		const parent = current.getParent();
		if (!parent) return null;
		if ($isRootOrShadowRoot(parent)) {
			return $isElementNode(current) ? current : null;
		}
		current = parent;
	}
	return null;
}

export function $getMarkdownBlockRawSource(block: ElementNode): string {
	return $getRawSource(block);
}

export function $getMarkdownBlockNodeRange(
	block: ElementNode,
	node: LexicalNode,
): MarkdownBlockNodeRange | null {
	if (!$isDescendantOf(block, node)) return null;
	let current: LexicalNode = node;
	let start = 0;
	while (current !== block) {
		const parent = current.getParent();
		if (!$isElementNode(parent)) return null;
		const previousLength = $getRawSourceLengthBeforeChild(parent, current);
		if (previousLength === null) return null;
		start += previousLength;
		current = parent;
	}
	return { start, end: start + $getRawSource(node).length };
}

export function $getMarkdownBlockOffset(block: ElementNode, point: PointType): number | null {
	const node = point.getNode();
	if (!$isDescendantOf(block, node)) return null;

	let offset = point.type === "text" ? point.offset : 0;
	let current: LexicalNode = node;
	while (current !== block) {
		const parent = current.getParent();
		if (!$isElementNode(parent)) return null;
		const previousLength = $getRawSourceLengthBeforeChild(parent, current);
		if (previousLength === null) return null;
		offset += previousLength;
		current = parent;
	}

	if (point.type === "element") {
		const element = point.getNode();
		if (!$isElementNode(element)) return null;
		const children = element.getChildren();
		if (point.offset < 0 || point.offset > children.length) return null;
		if ($isMarkdownSourceLink(element)) offset += 1;
		offset += children
			.slice(0, point.offset)
			.reduce((length, child) => length + $getRawSource(child).length, 0);
	}

	return offset;
}

export function $getMarkdownBlockSelectionSnapshot(
	selection: RangeSelection | null,
): MarkdownBlockSelectionSnapshot | null {
	if (!selection || !$isRangeSelection(selection)) return null;
	const block = $getTopLevelMarkdownBlock(selection.anchor.getNode());
	if (!block || $getTopLevelMarkdownBlock(selection.focus.getNode()) !== block) return null;
	const anchorOffset = $getMarkdownBlockOffset(block, selection.anchor);
	const focusOffset = $getMarkdownBlockOffset(block, selection.focus);
	if (anchorOffset === null || focusOffset === null) return null;
	return {
		block,
		anchorOffset,
		focusOffset,
		isBackward: selection.isBackward(),
	};
}

export function $replaceMarkdownBlockRawSource(
	block: ElementNode,
	selection: RangeSelection,
	source: string,
	anchorOffset: number,
	focusOffset: number,
) {
	const writableBlock = block.getWritable();
	writableBlock.clear();
	const text = $createTextNode(source);
	writableBlock.append(text);
	selection.anchor.set(text.getKey(), anchorOffset, "text");
	selection.focus.set(text.getKey(), focusOffset, "text");
}
