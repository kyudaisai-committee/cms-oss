import { $createQuoteNode, $isQuoteNode, QuoteNode } from "@lexical/rich-text";
import {
	$createLineBreakNode,
	$createParagraphNode,
	$createTextNode,
	$getSelection,
	$getState,
	$isElementNode,
	$isParagraphNode,
	$isRangeSelection,
	$isLineBreakNode,
	$setState,
	createState,
	ParagraphNode,
	TextNode,
	type ElementNode,
	type LexicalEditor,
	type LexicalNode,
	type RangeSelection,
} from "lexical";

import { $restoreMarkdownSelection } from "#editor/paragraph/reconcile";
import {
	$getMarkdownBlockRawSource,
	$getMarkdownBlockSelectionSnapshot,
	$getTopLevelMarkdownBlock,
	type MarkdownBlockSelectionSnapshot,
} from "#editor/shared/block-source";
import { $buildMarkdownInlineNodes } from "#editor/shared/inline-builder";
import {
	$createMarkdownInlineMarkerNode,
	$isMarkdownInlineMarkerNode,
	MarkdownInlineMarkerNode,
} from "#editor/shared/marker-node";
import { parseMarkdown } from "#editor/shared/parser";

const markdownQuoteRawState = createState("markdownQuoteRaw", {
	parse: (value): string | null => (typeof value === "string" ? value : null),
});

interface MarkdownQuoteLine {
	markerLength: number;
	body: string;
}

interface MarkdownQuoteSource {
	lines: MarkdownQuoteLine[];
}

function $getQuoteSource(rawSource: string): MarkdownQuoteSource | null {
	const root = parseMarkdown(rawSource);
	if (root.children.length !== 1 || root.children[0]?.type !== "blockquote") return null;
	if (root.children[0].children.some((child) => child.type !== "paragraph")) return null;

	const lines = rawSource.split("\n");
	const quoteLines: MarkdownQuoteLine[] = [];
	for (const line of lines) {
		const marker = /^>[ \t]/.exec(line)?.[0];
		if (!marker) return null;
		quoteLines.push({ markerLength: marker.length, body: line.slice(marker.length) });
	}
	return { lines: quoteLines };
}

function $getUninitializedQuoteSource(node: QuoteNode, rawSource: string) {
	let lineStart = true;
	for (const child of node.getChildren()) {
		if (lineStart && $isMarkdownInlineMarkerNode(child)) return null;
		lineStart = $isLineBreakNode(child);
	}
	return {
		lines: rawSource.split("\n").map((body) => ({ markerLength: 0, body })),
	} satisfies MarkdownQuoteSource;
}

function $getInlineLineChildren(source: string) {
	if (source.length === 0) return [];
	const root = parseMarkdown(source);
	const child = root.children[0];
	if (root.children.length !== 1 || child?.type !== "paragraph") return [$createTextNode(source)];
	return $buildMarkdownInlineNodes(child.children, source, {
		start: 0,
		end: source.length,
	});
}

function $getParagraphChildren(source: string) {
	if (source.length === 0) return [];
	const root = parseMarkdown(source);
	const child = root.children[0];
	if (root.children.length === 1 && child?.type === "paragraph") {
		return $buildMarkdownInlineNodes(child.children, source, {
			start: 0,
			end: source.length,
		});
	}
	return [$createTextNode(source)];
}

function $appendCanonicalQuoteChildren(quote: QuoteNode, info: MarkdownQuoteSource) {
	for (const [index, line] of info.lines.entries()) {
		quote.append(
			$createMarkdownInlineMarkerNode("> ", "prefix"),
			...$getInlineLineChildren(line.body),
		);
		if (index < info.lines.length - 1) quote.append($createLineBreakNode());
	}
	return quote;
}

function $createCanonicalQuote(info: MarkdownQuoteSource) {
	return $appendCanonicalQuoteChildren($createQuoteNode(), info);
}

function $adjustQuoteOffset(offset: number, rawSource: string, info: MarkdownQuoteSource) {
	const rawLines = rawSource.split("\n");
	let rawStart = 0;
	let canonicalStart = 0;
	for (const [index, line] of info.lines.entries()) {
		const rawLine = rawLines[index] ?? "";
		const rawEnd = rawStart + rawLine.length;
		if (offset <= rawEnd) {
			const relative = offset - rawStart;
			return (
				canonicalStart +
				(relative <= line.markerLength ? Math.min(relative, 2) : 2 + relative - line.markerLength)
			);
		}
		rawStart = rawEnd + 1;
		canonicalStart += line.body.length + 2;
		if (index < info.lines.length - 1) canonicalStart += 1;
	}
	return canonicalStart;
}

function $restoreQuoteSelection(
	selection: RangeSelection | null,
	snapshot: MarkdownBlockSelectionSnapshot | null,
	block: ElementNode,
	rawSource: string,
	info: MarkdownQuoteSource,
) {
	if (!selection || !snapshot) return;
	const adjusted = {
		...snapshot,
		block,
		anchorOffset: $adjustQuoteOffset(snapshot.anchorOffset, rawSource, info),
		focusOffset: $adjustQuoteOffset(snapshot.focusOffset, rawSource, info),
	};
	$restoreMarkdownSelection(block, selection, adjusted, null);
	if (!selection.isCollapsed()) return;
	let offset = 0;
	for (const child of block.getChildren()) {
		const length = $getQuoteNodeRawLength(child);
		if (
			$isMarkdownInlineMarkerNode(child) &&
			child.getMarkerSide() === "prefix" &&
			offset + length === adjusted.anchorOffset
		) {
			const childOffset = child.getIndexWithinParent() + 1;
			selection.anchor.set(block.getKey(), childOffset, "element");
			selection.focus.set(block.getKey(), childOffset, "element");
			return;
		}
		offset += length;
	}
}

function $getQuoteNodeRawLength(node: LexicalNode): number {
	if ($isLineBreakNode(node)) return 1;
	if ($isElementNode(node)) {
		return node.getChildren().reduce((length, child) => length + $getQuoteNodeRawLength(child), 0);
	}
	return node.getTextContentSize();
}

function $setQuoteRawState(quote: QuoteNode) {
	$setState(quote, markdownQuoteRawState, $getMarkdownBlockRawSource(quote));
}

function $getAdjacentQuoteSiblings(node: ParagraphNode) {
	const previous: QuoteNode[] = [];
	let previousSibling = node.getPreviousSibling();
	while ($isQuoteNode(previousSibling)) {
		previous.unshift(previousSibling);
		previousSibling = previousSibling.getPreviousSibling();
	}

	const next: QuoteNode[] = [];
	let nextSibling = node.getNextSibling();
	while ($isQuoteNode(nextSibling)) {
		next.push(nextSibling);
		nextSibling = nextSibling.getNextSibling();
	}
	return { next, previous };
}

function $mergeAdjacentQuotes(
	node: ParagraphNode,
	source: string,
	snapshot: MarkdownBlockSelectionSnapshot | null,
) {
	const { next, previous } = $getAdjacentQuoteSiblings(node);
	if (previous.length === 0 && next.length === 0) return false;
	const sources = [...previous, node, ...next].map((item) =>
		$isParagraphNode(item) ? source : $getMarkdownBlockRawSource(item),
	);
	const mergedSource = sources.join("\n");
	const info = $getQuoteSource(mergedSource);
	if (!info) return false;
	const prefixLength = previous.reduce(
		(length, quote) => length + $getMarkdownBlockRawSource(quote).length + 1,
		0,
	);

	const mergedQuote = $createCanonicalQuote(info);
	const first = previous[0] ?? node;
	const replaced = first.replace(mergedQuote);
	for (const quote of [...previous.slice(1), ...next]) quote.remove();
	if (previous.length > 0) node.remove();
	$setQuoteRawState(replaced);

	const mergedSnapshot =
		snapshot?.block.getKey() === node.getKey()
			? {
					...snapshot,
					anchorOffset: snapshot.anchorOffset + prefixLength,
					focusOffset: snapshot.focusOffset + prefixLength,
				}
			: null;
	const nextSelection = $getSelection();
	$restoreQuoteSelection(
		$isRangeSelection(nextSelection) ? nextSelection : null,
		mergedSnapshot,
		replaced,
		mergedSource,
		info,
	);
	return true;
}

export function $reconcileMarkdownQuoteParagraph(node: ParagraphNode) {
	const source = $getMarkdownBlockRawSource(node);
	const info = $getQuoteSource(source);
	if (!info) return false;
	const selection = $getSelection();
	const rangeSelection = $isRangeSelection(selection) ? selection : null;
	const snapshot = $getMarkdownBlockSelectionSnapshot(rangeSelection);
	if ($mergeAdjacentQuotes(node, source, snapshot)) return true;
	const quote = $createCanonicalQuote(info);
	const replaced = node.replace(quote);
	$setQuoteRawState(replaced);
	const nextSelection = $getSelection();
	$restoreQuoteSelection(
		$isRangeSelection(nextSelection) ? nextSelection : null,
		snapshot,
		replaced,
		source,
		info,
	);
	return true;
}

export function $reconcileMarkdownQuote(node: QuoteNode) {
	const source = $getMarkdownBlockRawSource(node);
	const previousRaw = $getState(node, markdownQuoteRawState);
	const initialized = previousRaw !== null;
	if (initialized && previousRaw === source) return false;
	const info =
		$getQuoteSource(source) ?? (!initialized ? $getUninitializedQuoteSource(node, source) : null);
	const selection = $getSelection();
	const rangeSelection = $isRangeSelection(selection) ? selection : null;
	const snapshot = $getMarkdownBlockSelectionSnapshot(rangeSelection);
	if (!info) {
		const paragraph = $createParagraphNode();
		paragraph.append(...$getParagraphChildren(source));
		const replaced = node.replace(paragraph);
		const nextSelection = $getSelection();
		if ($isRangeSelection(nextSelection) && snapshot?.block.getKey() === node.getKey()) {
			$restoreMarkdownSelection(replaced, nextSelection, snapshot, null);
		}
		return true;
	}

	const quote = $createCanonicalQuote(info);
	const replaced = node.replace(quote);
	$setQuoteRawState(replaced);
	const nextSelection = $getSelection();
	$restoreQuoteSelection(
		$isRangeSelection(nextSelection) && snapshot?.block.getKey() === node.getKey()
			? nextSelection
			: null,
		snapshot?.block.getKey() === node.getKey() ? snapshot : null,
		replaced,
		source,
		info,
	);
	return true;
}

function $reconcileMarkdownQuoteText(node: TextNode) {
	const block = $getTopLevelMarkdownBlock(node);
	if ($isParagraphNode(block)) {
		$reconcileMarkdownQuoteParagraph(block);
		return;
	}
	if ($isQuoteNode(block)) $reconcileMarkdownQuote(block);
}

export function registerMarkdownQuoteReconciler(editor: LexicalEditor) {
	const removeTextTransform = editor.registerNodeTransform(TextNode, $reconcileMarkdownQuoteText);
	const removeMarkerTransform = editor.registerNodeTransform(
		MarkdownInlineMarkerNode,
		$reconcileMarkdownQuoteText,
	);
	const removeParagraphTransform = editor.registerNodeTransform(
		ParagraphNode,
		$reconcileMarkdownQuoteParagraph,
	);
	const removeQuoteTransform = editor.registerNodeTransform(QuoteNode, $reconcileMarkdownQuote);
	return () => {
		removeTextTransform();
		removeMarkerTransform();
		removeParagraphTransform();
		removeQuoteTransform();
	};
}
