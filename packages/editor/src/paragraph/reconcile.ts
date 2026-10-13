import { $isLinkNode } from "@lexical/link";
import {
	$getSelection,
	$getState,
	$isElementNode,
	$isLineBreakNode,
	$isRangeSelection,
	$isTextNode,
	$setState,
	createState,
	ParagraphNode,
	type ElementNode,
	type LexicalNode,
	type RangeSelection,
	type TextNode,
} from "lexical";

import {
	$isMarkdownBoldNode,
	$isMarkdownInlineCodeNode,
	$isMarkdownItalicNode,
	$isMarkdownStrikethroughNode,
} from "#editor/inline/nodes";
import { $getStructuredLinkRole, $isStructuredLink } from "#editor/link/model";
import {
	$getMarkdownBlockRawSource,
	$getMarkdownBlockSelectionSnapshot,
	$isMarkdownSourceLink,
	type MarkdownBlockSelectionSnapshot,
} from "#editor/shared/block-source";
import { $buildMarkdownInlineNodes } from "#editor/shared/inline-builder";
import { $isMarkdownInlineMarkerNode } from "#editor/shared/marker-node";
import { parseMarkdown } from "#editor/shared/parser";

const markdownParagraphRawState = createState("markdownParagraphRaw", {
	parse: (value): string | null => (typeof value === "string" ? value : null),
});

interface MarkdownLeafRange {
	node: TextNode;
	start: number;
	end: number;
}

interface MarkdownElementPoint {
	key: string;
	offset: number;
	type: "element";
}

interface MarkdownTextPoint {
	key: string;
	offset: number;
	type: "text";
}

type MarkdownResolvedPoint = MarkdownElementPoint | MarkdownTextPoint;

interface MarkdownOwnerAfterPoint {
	parent: ElementNode;
	index: number;
}

export function $reconcileMarkdownParagraph(paragraph: ParagraphNode) {
	const rawSource = $getMarkdownBlockRawSource(paragraph);
	if ($getState(paragraph, markdownParagraphRawState) === rawSource) return false;

	const root = parseMarkdown(rawSource);
	const markdownParagraph = root.children[0];
	if (
		(root.children.length === 0 && rawSource.length > 0) ||
		root.children.length > 1 ||
		(markdownParagraph && markdownParagraph.type !== "paragraph")
	) {
		return false;
	}

	const selection = $getSelection();
	const rangeSelection = $isRangeSelection(selection) ? selection : null;
	const snapshot = $getMarkdownBlockSelectionSnapshot(rangeSelection);
	const children =
		markdownParagraph?.type === "paragraph"
			? $buildMarkdownInlineNodes(markdownParagraph.children, rawSource, {
					start: 0,
					end: rawSource.length,
				})
			: [];

	const writableParagraph = paragraph.getWritable();
	writableParagraph.clear();
	writableParagraph.append(...children);
	$setState(writableParagraph, markdownParagraphRawState, rawSource);

	if (rangeSelection && snapshot?.block.getKey() === paragraph.getKey()) {
		const closingOwner =
			snapshot.anchorOffset === snapshot.focusOffset
				? $findMarkdownClosingOwnerAfterPoint(paragraph, 0, snapshot.anchorOffset)
				: null;
		$restoreMarkdownSelection(writableParagraph, rangeSelection, snapshot, closingOwner);
	}
	return true;
}

function $getMarkdownNodeRawLength(node: LexicalNode): number {
	if ($isTextNode(node)) return node.getTextContentSize();
	if ($isLineBreakNode(node)) return 1;
	if ($isMarkdownSourceLink(node)) {
		return $getMarkdownBlockRawSource(node).length;
	}
	if ($isElementNode(node)) {
		return node
			.getChildren()
			.reduce((length, child) => length + $getMarkdownNodeRawLength(child), 0);
	}
	return node.getTextContent().length;
}

function $collectMarkdownLeafRanges(
	node: LexicalNode,
	start: number,
	leaves: MarkdownLeafRange[],
): number {
	if ($isLinkNode(node)) {
		const sourceLink = $isMarkdownSourceLink(node);
		let offset = start + (sourceLink ? 1 : 0);
		for (const child of node.getChildren()) {
			offset = $collectMarkdownLeafRanges(child, offset, leaves);
		}
		return offset + (sourceLink ? node.getURL().length + 3 : 0);
	}
	if ($isTextNode(node)) {
		const end = start + node.getTextContentSize();
		if (end > start) leaves.push({ node, start, end });
		return end;
	}
	if (!$isElementNode(node)) return start + $getMarkdownNodeRawLength(node);
	let offset = start;
	for (const child of node.getChildren()) {
		offset = $collectMarkdownLeafRanges(child, offset, leaves);
	}
	return offset;
}

function $resolveMarkdownTextPoint(block: ElementNode, offset: number): MarkdownResolvedPoint {
	const leaves: MarkdownLeafRange[] = [];
	const total = $collectMarkdownLeafRanges(block, 0, leaves);
	const target = Math.max(0, Math.min(offset, total));
	const contentLeaf = leaves.find(
		(leaf) => !$isMarkdownInlineMarkerNode(leaf.node) && target >= leaf.start && target <= leaf.end,
	);
	const leaf = contentLeaf ?? leaves.find((item) => target >= item.start && target <= item.end);
	if (leaf) {
		return {
			key: leaf.node.getKey(),
			offset: Math.max(0, Math.min(target - leaf.start, leaf.end - leaf.start)),
			type: "text",
		};
	}
	return { key: block.getKey(), offset: block.getChildrenSize(), type: "element" };
}

function $isMarkdownInlineOwner(node: ElementNode): boolean {
	return (
		$isMarkdownBoldNode(node) ||
		$isMarkdownItalicNode(node) ||
		$isMarkdownStrikethroughNode(node) ||
		$isMarkdownInlineCodeNode(node) ||
		($isLinkNode(node) && $isStructuredLink(node))
	);
}

function $isMarkdownClosingOwner(node: ElementNode): boolean {
	if (!$isMarkdownInlineOwner(node)) return false;
	const last = node.getLastChild();
	if ($isMarkdownInlineMarkerNode(last)) return last.getMarkerSide() === "suffix";
	return last !== null && $getStructuredLinkRole(last) === "suffix";
}

function $findMarkdownClosingOwnerAfterPoint(
	element: ElementNode,
	start: number,
	target: number,
): MarkdownOwnerAfterPoint | null {
	let offset = start;
	for (const child of element.getChildren()) {
		const childStart = offset;
		offset += $getMarkdownNodeRawLength(child);
		if ($isElementNode(child)) {
			if ($isMarkdownClosingOwner(child) && offset === target) {
				return { parent: element, index: child.getIndexWithinParent() + 1 };
			}
			const nested = $findMarkdownClosingOwnerAfterPoint(child, childStart, target);
			if (nested) return nested;
		}
	}
	return null;
}

export function $restoreMarkdownSelection(
	paragraph: ElementNode,
	selection: RangeSelection,
	snapshot: MarkdownBlockSelectionSnapshot,
	closingOwner: MarkdownOwnerAfterPoint | null,
) {
	if (closingOwner && snapshot.anchorOffset === snapshot.focusOffset) {
		selection.anchor.set(closingOwner.parent.getKey(), closingOwner.index, "element");
		selection.focus.set(closingOwner.parent.getKey(), closingOwner.index, "element");
		return;
	}
	const anchor = $resolveMarkdownTextPoint(paragraph, snapshot.anchorOffset);
	const focus = $resolveMarkdownTextPoint(paragraph, snapshot.focusOffset);
	selection.anchor.set(anchor.key, anchor.offset, anchor.type);
	selection.focus.set(focus.key, focus.offset, focus.type);
}
