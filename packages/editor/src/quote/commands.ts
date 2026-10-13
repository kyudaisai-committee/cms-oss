import { $createQuoteNode, $isQuoteNode, QuoteNode } from "@lexical/rich-text";
import {
	COMMAND_PRIORITY_HIGH,
	INSERT_LINE_BREAK_COMMAND,
	INSERT_PARAGRAPH_COMMAND,
	$createLineBreakNode,
	$createParagraphNode,
	$getSelection,
	$isLineBreakNode,
	$isRangeSelection,
	$isTextNode,
	KEY_BACKSPACE_COMMAND,
	type LexicalEditor,
	type LexicalNode,
	type RangeSelection,
} from "lexical";

import { $isQuoteMarker } from "#editor/quote/markers";
import { $getTopLevelMarkdownBlock } from "#editor/shared/block-source";
import {
	$createMarkdownInlineMarkerNode,
	$isMarkdownInlineMarkerNode,
	type MarkdownInlineMarkerNode,
} from "#editor/shared/marker-node";

function $getQuoteFromSelection() {
	const selection = $getSelection();
	if (!$isRangeSelection(selection)) return null;
	const quote = $getTopLevelMarkdownBlock(selection.anchor.getNode());
	if (!$isQuoteNode(quote)) return null;
	if ($getTopLevelMarkdownBlock(selection.focus.getNode()) !== quote) return null;
	return quote;
}

interface EmptyQuoteLine {
	marker: MarkdownInlineMarkerNode;
	markerIndex: number;
	previousLineBreak: LexicalNode | null;
	nextLineBreak: LexicalNode | null;
}

function $getEmptyQuoteLine(quote: QuoteNode, selection: RangeSelection) {
	if (!selection.isCollapsed()) return null;
	const { anchor, focus } = selection;
	if (anchor.type !== focus.type || anchor.key !== focus.key || anchor.offset !== focus.offset)
		return null;

	let marker: MarkdownInlineMarkerNode | null = null;
	if (anchor.type === "text") {
		const node = anchor.getNode();
		if ($isMarkdownInlineMarkerNode(node) && anchor.offset === node.getTextContentSize()) {
			marker = node;
		}
	} else if (anchor.key === quote.getKey() && anchor.offset > 0) {
		const node = quote.getChildAtIndex(anchor.offset - 1);
		if ($isMarkdownInlineMarkerNode(node)) marker = node;
	}
	if (!marker || marker.getParent()?.getKey() !== quote.getKey() || !$isQuoteMarker(marker)) {
		return null;
	}

	const markerIndex = marker.getIndexWithinParent();
	const previousLineBreak = marker.getPreviousSibling();
	const nextLineBreak = marker.getNextSibling();
	if (nextLineBreak !== null && !$isLineBreakNode(nextLineBreak)) return null;
	if (previousLineBreak !== null && !$isLineBreakNode(previousLineBreak)) return null;
	return {
		marker,
		markerIndex,
		previousLineBreak,
		nextLineBreak,
	} satisfies EmptyQuoteLine;
}

function $setParagraphStartSelection(paragraph: ReturnType<typeof $createParagraphNode>) {
	paragraph.selectStart();
}

function $replaceQuoteWithParagraph(quote: QuoteNode) {
	const paragraph = $createParagraphNode();
	quote.replace(paragraph);
	$setParagraphStartSelection(paragraph);
}

function $exitQuoteEmptyLine(quote: QuoteNode, line: EmptyQuoteLine) {
	if (line.nextLineBreak !== null) return false;
	if (quote.getChildrenSize() === 1) {
		$replaceQuoteWithParagraph(quote);
		return true;
	}
	line.marker.remove();
	line.previousLineBreak?.remove();
	if (quote.getChildrenSize() === 1 && $isQuoteMarker(quote.getFirstChild())) {
		$replaceQuoteWithParagraph(quote);
		return true;
	}
	const paragraph = $createParagraphNode();
	quote.insertAfter(paragraph);
	$setParagraphStartSelection(paragraph);
	return true;
}

function $splitQuoteAtEmptyLine(quote: QuoteNode, line: EmptyQuoteLine) {
	if (line.nextLineBreak === null) return false;
	const children = quote.getChildren();
	const beforeChildren = line.markerIndex === 0 ? [] : children.slice(0, line.markerIndex - 1);
	const afterChildren = children.slice(line.markerIndex + 2);
	const beforeQuote = $createQuoteNode();
	const afterQuote = $createQuoteNode();
	for (const child of children) child.remove();
	beforeQuote.append(...beforeChildren);
	afterQuote.append(...afterChildren);
	const paragraph = $createParagraphNode();
	if (beforeChildren.length > 0) {
		quote.replace(beforeQuote);
		beforeQuote.insertAfter(paragraph);
		paragraph.insertAfter(afterQuote);
	} else {
		quote.replace(paragraph);
		paragraph.insertAfter(afterQuote);
	}
	$setParagraphStartSelection(paragraph);
	return true;
}

function $handleEmptyQuoteLine(quote: QuoteNode, selection: RangeSelection, split: boolean) {
	const line = $getEmptyQuoteLine(quote, selection);
	if (!line) return false;
	return split ? $splitQuoteAtEmptyLine(quote, line) : $exitQuoteEmptyLine(quote, line);
}

function $insertQuoteLineBreak(selectStart: boolean, exitEmptyLine = false) {
	const quote = $getQuoteFromSelection();
	if (!quote) return false;
	const selection = $getSelection();
	if (!$isRangeSelection(selection)) return false;
	if (exitEmptyLine && $handleEmptyQuoteLine(quote, selection, false)) return true;
	if (
		selection.anchor.type === "text" &&
		selection.focus.type === "text" &&
		selection.anchor.key === selection.focus.key
	) {
		const textNode = selection.focus.getNode();
		if ($isTextNode(textNode) && textNode.getParent()?.getKey() === quote.getKey()) {
			const offset = selection.focus.offset;
			const splitNodes =
				offset > 0 && offset < textNode.getTextContentSize()
					? textNode.splitText(offset)
					: [textNode];
			const before = splitNodes[0];
			const after = splitNodes[1];
			if (!before) return false;
			const previousSibling = textNode.getPreviousSibling();
			const lineBreak = $createLineBreakNode();
			if (offset === 0) textNode.insertBefore(lineBreak);
			else if (after) after.insertBefore(lineBreak);
			else before.insertAfter(lineBreak);
			const marker = $createMarkdownInlineMarkerNode("> ", "prefix");
			lineBreak.insertAfter(marker);
			const offsetAfterMarker =
				offset === 0 && $isMarkdownInlineMarkerNode(previousSibling)
					? previousSibling.getIndexWithinParent() + 1
					: marker.getIndexWithinParent() + 1;
			selection.anchor.set(quote.getKey(), offsetAfterMarker, "element");
			selection.focus.set(quote.getKey(), offsetAfterMarker, "element");
			return true;
		}
	}
	const existingLineBreakKeys = new Set(
		quote
			.getChildren()
			.filter($isLineBreakNode)
			.map((lineBreak) => lineBreak.getKey()),
	);
	selection.insertLineBreak(selectStart);
	const nextSelection = $getSelection();
	if (!$isRangeSelection(nextSelection)) return true;
	const lineBreak = quote
		.getChildren()
		.find((child) => $isLineBreakNode(child) && !existingLineBreakKeys.has(child.getKey()));
	if (!lineBreak) return true;
	const marker = $createMarkdownInlineMarkerNode("> ", "prefix");
	lineBreak.insertAfter(marker);
	const offset = marker.getIndexWithinParent() + 1;
	nextSelection.anchor.set(quote.getKey(), offset, "element");
	nextSelection.focus.set(quote.getKey(), offset, "element");
	return true;
}

function $handleQuoteBackspace(event: KeyboardEvent) {
	const quote = $getQuoteFromSelection();
	const selection = $getSelection();
	if (!quote || !$isRangeSelection(selection)) return false;
	const line = $getEmptyQuoteLine(quote, selection);
	if (!line) return false;
	const handled =
		line.nextLineBreak === null
			? $exitQuoteEmptyLine(quote, line)
			: $splitQuoteAtEmptyLine(quote, line);
	if (!handled) return false;
	event.preventDefault();
	return true;
}

export function registerMarkdownQuoteCommands(editor: LexicalEditor) {
	const removeParagraphCommand = editor.registerCommand(
		INSERT_PARAGRAPH_COMMAND,
		() => $insertQuoteLineBreak(false, true),
		COMMAND_PRIORITY_HIGH,
	);
	const removeLineBreakCommand = editor.registerCommand(
		INSERT_LINE_BREAK_COMMAND,
		(selectStart) => $insertQuoteLineBreak(selectStart),
		COMMAND_PRIORITY_HIGH,
	);
	const removeBackspaceCommand = editor.registerCommand(
		KEY_BACKSPACE_COMMAND,
		$handleQuoteBackspace,
		COMMAND_PRIORITY_HIGH,
	);
	return () => {
		removeParagraphCommand();
		removeLineBreakCommand();
		removeBackspaceCommand();
	};
}
