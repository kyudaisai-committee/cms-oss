import {
	$getSelection,
	$isParagraphNode,
	$isRangeSelection,
	type LexicalEditor,
	type LexicalNode,
	type ParagraphNode,
	type RangeSelection,
} from "lexical";

import {
	$isMarkdownBoldNode,
	$isMarkdownInlineCodeNode,
	$isMarkdownItalicNode,
	$isMarkdownStrikethroughNode,
	type MarkdownInlineFormat,
	MarkdownInlineFormatNode,
} from "#editor/inline/nodes";
import { $reconcileMarkdownParagraph } from "#editor/paragraph/reconcile";
import {
	$getMarkdownBlockNodeRange,
	$getMarkdownBlockRawSource,
	$getMarkdownBlockSelectionSnapshot,
	$replaceMarkdownBlockRawSource,
	type MarkdownBlockSelectionSnapshot,
} from "#editor/shared/block-source";
import { $isMarkdownInlineMarkerNode } from "#editor/shared/marker-node";

const INLINE_DELIMITERS = {
	bold: "**",
	italic: "*",
	strikethrough: "~~",
	code: "`",
} satisfies Record<MarkdownInlineFormat, string>;

interface MarkdownInlineWrap {
	open: string;
	close: string;
	content: string;
}

interface MarkdownRawEdit {
	source: string;
	anchorOffset: number;
	focusOffset: number;
}

export function toggleMarkdownInlineFormat(editor: LexicalEditor, format: MarkdownInlineFormat) {
	editor.update(
		() => {
			const selection = $getSelection();
			if (!$isRangeSelection(selection)) return;
			const snapshot = $getMarkdownBlockSelectionSnapshot(selection);
			if (!snapshot || !$isParagraphNode(snapshot.block)) return;

			const rawSource = $getMarkdownBlockRawSource(snapshot.block);
			const owner = $findMatchingInlineOwner(selection, format);
			const edit = owner
				? $removeInlineOwnerMarkers(snapshot.block, rawSource, snapshot, owner)
				: $wrapMarkdownSelection(rawSource, snapshot, format);
			if (!edit) return;

			$replaceMarkdownBlockRawSource(
				snapshot.block,
				selection,
				edit.source,
				edit.anchorOffset,
				edit.focusOffset,
			);
			$reconcileMarkdownParagraph(snapshot.block);
		},
		{ discrete: true },
	);
}

export function $findMarkdownInlineFormatAncestor(
	node: LexicalNode | null,
	format: MarkdownInlineFormat,
) {
	return $findInlineOwner(node, format);
}

function $isInlineFormatOwner(
	node: LexicalNode | null,
	format: MarkdownInlineFormat,
): node is MarkdownInlineFormatNode {
	if (node === null) return false;
	if (format === "bold") return $isMarkdownBoldNode(node);
	if (format === "italic") return $isMarkdownItalicNode(node);
	if (format === "strikethrough") return $isMarkdownStrikethroughNode(node);
	return $isMarkdownInlineCodeNode(node);
}

function $findMatchingInlineOwner(
	selection: RangeSelection,
	format: MarkdownInlineFormat,
): MarkdownInlineFormatNode | null {
	const anchorOwner = $findInlineOwner(selection.anchor.getNode(), format);
	const focusOwner = $findInlineOwner(selection.focus.getNode(), format);
	return anchorOwner && anchorOwner === focusOwner ? anchorOwner : null;
}

function $findInlineOwner(
	node: LexicalNode | null,
	format: MarkdownInlineFormat,
): MarkdownInlineFormatNode | null {
	let current: LexicalNode | null = node;
	while (current) {
		if ($isInlineFormatOwner(current, format)) return current;
		current = current.getParent();
	}
	return null;
}

function $getInlineOwnerMarkerRange(block: ParagraphNode, owner: MarkdownInlineFormatNode) {
	const first = owner.getFirstChild();
	const last = owner.getLastChild();
	if (
		!$isMarkdownInlineMarkerNode(first) ||
		!$isMarkdownInlineMarkerNode(last) ||
		first === last ||
		first.getMarkerSide() !== "prefix" ||
		last.getMarkerSide() !== "suffix"
	)
		return null;
	const range = $getMarkdownBlockNodeRange(block, owner);
	if (!range) return null;
	const openLength = first.getTextContentSize();
	const closeLength = last.getTextContentSize();
	if (range.end - range.start < openLength + closeLength) return null;
	return { range, openLength, closeLength };
}

function $removeInlineOwnerMarkers(
	block: ParagraphNode,
	rawSource: string,
	snapshot: MarkdownBlockSelectionSnapshot,
	owner: MarkdownInlineFormatNode,
): MarkdownRawEdit | null {
	const ownerMarkers = $getInlineOwnerMarkerRange(block, owner);
	if (!ownerMarkers) return null;
	const { range, openLength, closeLength } = ownerMarkers;
	const contentStart = range.start + openLength;
	const contentEnd = range.end - closeLength;
	const source =
		rawSource.slice(0, range.start) +
		rawSource.slice(contentStart, contentEnd) +
		rawSource.slice(range.end);
	return {
		source,
		anchorOffset: $shiftOffsetAfterMarkerRemoval(
			snapshot.anchorOffset,
			range.start,
			contentStart,
			contentEnd,
			range.end,
			openLength,
			closeLength,
		),
		focusOffset: $shiftOffsetAfterMarkerRemoval(
			snapshot.focusOffset,
			range.start,
			contentStart,
			contentEnd,
			range.end,
			openLength,
			closeLength,
		),
	};
}

function $shiftOffsetAfterMarkerRemoval(
	offset: number,
	start: number,
	contentStart: number,
	contentEnd: number,
	end: number,
	openLength: number,
	closeLength: number,
) {
	if (offset <= start) return offset;
	if (offset <= contentStart) return start;
	if (offset <= contentEnd) return offset - openLength;
	if (offset < end) return contentEnd - openLength;
	return offset - openLength - closeLength;
}

function $wrapMarkdownSelection(
	rawSource: string,
	snapshot: MarkdownBlockSelectionSnapshot,
	format: MarkdownInlineFormat,
): MarkdownRawEdit {
	const start = Math.min(snapshot.anchorOffset, snapshot.focusOffset);
	const end = Math.max(snapshot.anchorOffset, snapshot.focusOffset);
	const selectedSource = rawSource.slice(start, end);
	const wrap = $getMarkdownInlineWrap(selectedSource, format);
	return {
		source:
			rawSource.slice(0, start) + wrap.open + wrap.content + wrap.close + rawSource.slice(end),
		anchorOffset: $shiftOffsetAfterWrap(
			snapshot.anchorOffset,
			start,
			end,
			wrap.open.length,
			wrap.close.length,
		),
		focusOffset: $shiftOffsetAfterWrap(
			snapshot.focusOffset,
			start,
			end,
			wrap.open.length,
			wrap.close.length,
		),
	};
}

function $getMarkdownInlineWrap(
	selectedSource: string,
	format: MarkdownInlineFormat,
): MarkdownInlineWrap {
	if (format !== "code") {
		const delimiter = INLINE_DELIMITERS[format];
		return { open: delimiter, close: delimiter, content: selectedSource };
	}

	const longestRun = Math.max(0, ...(selectedSource.match(/`+/g) ?? []).map((run) => run.length));
	const fence = "`".repeat(longestRun + 1);
	const needsPadding =
		selectedSource.length > 0 &&
		(selectedSource.includes("`") ||
			(selectedSource.startsWith(" ") && selectedSource.endsWith(" ")));

	const padding = needsPadding ? " " : "";
	return { open: fence + padding, close: padding + fence, content: selectedSource };
}

function $shiftOffsetAfterWrap(
	offset: number,
	start: number,
	end: number,
	openLength: number,
	closeLength: number,
) {
	if (offset < start) return offset;
	if (offset <= end) return offset + openLength;
	return offset + openLength + closeLength;
}
