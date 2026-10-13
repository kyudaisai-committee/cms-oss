import {
	$createHeadingNode,
	$isHeadingNode,
	type HeadingTagType,
	HeadingNode,
} from "@lexical/rich-text";
import {
	$createParagraphNode,
	$createTextNode,
	$getSelection,
	$getState,
	$isParagraphNode,
	$isRangeSelection,
	$setState,
	createState,
	ParagraphNode,
	type ElementNode,
	type LexicalEditor,
	type RangeSelection,
	TextNode,
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

const markdownHeadingRawState = createState("markdownHeadingRaw", {
	parse: (value): string | null => (typeof value === "string" ? value : null),
});

interface MarkdownHeadingSource {
	tag: HeadingTagType;
	markerLength: number;
	bodyStart: number;
	children: Parameters<typeof $buildMarkdownInlineNodes>[0];
}

function $getCanonicalHeadingTag(depth: number): HeadingTagType {
	return `h${Math.max(2, Math.min(6, depth))}` as HeadingTagType;
}

function $getHeadingSource(rawSource: string): MarkdownHeadingSource | null {
	if (!/^#{1,6}[ \t]+/.test(rawSource)) return null;
	const root = parseMarkdown(rawSource);
	if (root.children.length !== 1) return null;
	const child = root.children[0];
	if (!child || child.type !== "heading") return null;
	if (child.depth < 2 || child.depth > 6) return null;
	const markerStart = child.position?.start.offset ?? 0;
	const firstChildStart = child.children[0]?.position?.start.offset;
	const markerLength =
		firstChildStart === undefined
			? (rawSource.slice(markerStart).match(/^#{1,6}[ \t]+/)?.[0].length ?? 0)
			: firstChildStart - markerStart;
	return {
		tag: $getCanonicalHeadingTag(child.depth),
		markerLength,
		bodyStart: firstChildStart ?? markerStart + markerLength,
		children: child.children,
	};
}

function $getParagraphChildren(source: string) {
	const root = parseMarkdown(source);
	if (root.children.length !== 1) return source.length > 0 ? [$createTextNode(source)] : [];
	const child = root.children[0];
	if (!child) return source.length > 0 ? [$createTextNode(source)] : [];
	return child.type === "paragraph"
		? $buildMarkdownInlineNodes(child.children, source, { start: 0, end: source.length })
		: source.length > 0
			? [$createTextNode(source)]
			: [];
}

function $getHeadingMarkerText(tag: HeadingTagType) {
	return "#".repeat(Number(tag.slice(1))) + " ";
}

function $createCanonicalHeading(source: string, info: MarkdownHeadingSource) {
	const heading = $createHeadingNode(info.tag);
	heading.append(
		$createMarkdownInlineMarkerNode($getHeadingMarkerText(info.tag), "prefix"),
		...$buildMarkdownInlineNodes(info.children, source, {
			start: info.bodyStart,
			end: source.length,
		}),
	);
	return heading;
}

function $adjustHeadingOffset(offset: number, oldMarkerLength: number, newMarkerLength: number) {
	if (offset <= oldMarkerLength) return Math.min(offset, newMarkerLength);
	return offset + newMarkerLength - oldMarkerLength;
}

function $restoreHeadingSelection(
	selection: RangeSelection | null,
	snapshot: MarkdownBlockSelectionSnapshot | null,
	block: ElementNode,
	oldMarkerLength: number,
	newMarkerLength: number,
) {
	if (!selection || !snapshot) return;
	const adjusted = {
		...snapshot,
		block,
		anchorOffset: $adjustHeadingOffset(snapshot.anchorOffset, oldMarkerLength, newMarkerLength),
		focusOffset: $adjustHeadingOffset(snapshot.focusOffset, oldMarkerLength, newMarkerLength),
	};
	$restoreMarkdownSelection(block, selection, adjusted, null);
}

function $setHeadingRawState(heading: HeadingNode) {
	$setState(heading, markdownHeadingRawState, $getMarkdownBlockRawSource(heading));
}

export function $reconcileMarkdownHeadingParagraph(node: ParagraphNode) {
	const source = $getMarkdownBlockRawSource(node);
	const info = $getHeadingSource(source);
	if (!info) return false;
	const selection = $getSelection();
	const rangeSelection = $isRangeSelection(selection) ? selection : null;
	const snapshot = $getMarkdownBlockSelectionSnapshot(rangeSelection);
	const heading = $createCanonicalHeading(source, info);
	const replaced = node.replace(heading);
	$setHeadingRawState(replaced);
	const nextSelection = $getSelection();
	$restoreHeadingSelection(
		$isRangeSelection(nextSelection) ? nextSelection : null,
		snapshot,
		replaced,
		info.markerLength,
		replaced.getFirstChild()?.getTextContentSize() ?? 0,
	);
	return true;
}

function $getUninitializedHeadingSource(node: HeadingNode, source: string) {
	if ($isMarkdownInlineMarkerNode(node.getFirstChild())) return null;
	const root = parseMarkdown(source);
	if (root.children.length === 0 && source.length === 0) {
		return {
			tag: $getCanonicalHeadingTag(Number(node.getTag().slice(1))),
			markerLength: 0,
			bodyStart: 0,
			children: [],
		} satisfies MarkdownHeadingSource;
	}
	if (root.children.length !== 1 || root.children[0]?.type !== "paragraph") return null;
	return {
		tag: $getCanonicalHeadingTag(Number(node.getTag().slice(1))),
		markerLength: 0,
		bodyStart: 0,
		children: root.children[0].children,
	} satisfies MarkdownHeadingSource;
}

export function $reconcileMarkdownHeading(node: HeadingNode) {
	const source = $getMarkdownBlockRawSource(node);
	const previousRaw = $getState(node, markdownHeadingRawState);
	const initialized = previousRaw !== null;
	if (initialized && previousRaw === source) return false;
	const info =
		$getHeadingSource(source) ??
		(!initialized ? $getUninitializedHeadingSource(node, source) : null);
	const selection = $getSelection();
	const rangeSelection = $isRangeSelection(selection) ? selection : null;
	const snapshot = $getMarkdownBlockSelectionSnapshot(rangeSelection);
	if (!info) {
		const paragraph = $createParagraphNode();
		paragraph.append(...$getParagraphChildren(source));
		const replaced = node.replace(paragraph);
		const nextSelection = $getSelection();
		if ($isRangeSelection(nextSelection) && snapshot) {
			$restoreMarkdownSelection(replaced, nextSelection, { ...snapshot, block: replaced }, null);
		}
		return true;
	}

	const writableHeading = node.getWritable();
	writableHeading.setTag(info.tag);
	writableHeading.clear();
	writableHeading.append(
		$createMarkdownInlineMarkerNode($getHeadingMarkerText(info.tag), "prefix"),
		...$buildMarkdownInlineNodes(info.children, source, {
			start: info.bodyStart,
			end: source.length,
		}),
	);
	$setHeadingRawState(writableHeading);
	const nextSelection = $getSelection();
	$restoreHeadingSelection(
		$isRangeSelection(nextSelection) ? nextSelection : null,
		snapshot,
		writableHeading,
		info.markerLength,
		writableHeading.getFirstChild()?.getTextContentSize() ?? 0,
	);
	return true;
}

function $reconcileMarkdownHeadingText(node: TextNode) {
	const block = $getTopLevelMarkdownBlock(node);
	if ($isParagraphNode(block)) {
		$reconcileMarkdownHeadingParagraph(block);
		return;
	}
	if ($isHeadingNode(block)) $reconcileMarkdownHeading(block);
}

export function registerMarkdownHeadingReconciler(editor: LexicalEditor) {
	const removeTextTransform = editor.registerNodeTransform(TextNode, $reconcileMarkdownHeadingText);
	const removeMarkerTransform = editor.registerNodeTransform(
		MarkdownInlineMarkerNode,
		$reconcileMarkdownHeadingText,
	);
	const removeParagraphTransform = editor.registerNodeTransform(
		ParagraphNode,
		$reconcileMarkdownHeadingParagraph,
	);
	const removeHeadingTransform = editor.registerNodeTransform(
		HeadingNode,
		$reconcileMarkdownHeading,
	);
	return () => {
		removeTextTransform();
		removeMarkerTransform();
		removeParagraphTransform();
		removeHeadingTransform();
	};
}
