import { $createLineBreakNode, $createTextNode, type LexicalNode } from "lexical";

import {
	$createMarkdownBoldNode,
	$createMarkdownInlineCodeNode,
	$createMarkdownItalicNode,
	$createMarkdownStrikethroughNode,
} from "#editor/inline/nodes";
import { $createStructuredLinkNode, type StructuredLinkSourceTokens } from "#editor/link/model";
import type { parseMarkdown } from "#editor/shared/parser";

type MarkdownRoot = ReturnType<typeof parseMarkdown>;
type MarkdownBlock = MarkdownRoot["children"][number];
type MarkdownPhrasingContent = Extract<MarkdownBlock, { type: "paragraph" }>["children"][number];

interface SourceRange {
	start: number;
	end: number;
}

interface InlineCodeSource {
	syntax: string;
	body: string;
}

const explicitMarkdownLinkPattern = /^\[[\s\S]+\]\([\s\S]*\)$/;

export function $buildMarkdownInlineNodes(
	children: MarkdownPhrasingContent[],
	source: string,
	range: SourceRange = { start: 0, end: source.length },
) {
	const nodes: LexicalNode[] = [];
	let cursor = Math.max(0, range.start);
	const end = Math.min(source.length, Math.max(cursor, range.end));
	for (const child of children) {
		const childRange = $getSourceRange(child);
		if (childRange) {
			if (childRange.start > cursor)
				nodes.push($createTextNode(source.slice(cursor, childRange.start)));
			nodes.push(...$buildMarkdownInlineNode(child, source));
			cursor = Math.max(cursor, childRange.end);
		} else {
			nodes.push(...$buildMarkdownInlineNode(child, source));
		}
	}
	if (cursor < end) nodes.push($createTextNode(source.slice(cursor, end)));
	return nodes;
}

function $buildMarkdownInlineNode(node: MarkdownPhrasingContent, source: string): LexicalNode[] {
	switch (node.type) {
		case "text":
			return [$createTextNode($getSourceSlice(node, source))];
		case "strong":
			return [
				$createMarkdownBoldNode(
					$buildMarkdownInlineNodes(node.children, source, $getNestedContentRange(node, source)),
					$getDelimiter(node, source, "**"),
				),
			];
		case "emphasis":
			return [
				$createMarkdownItalicNode(
					$buildMarkdownInlineNodes(node.children, source, $getNestedContentRange(node, source)),
					$getDelimiter(node, source, "*"),
				),
			];
		case "delete":
			return [
				$createMarkdownStrikethroughNode(
					$buildMarkdownInlineNodes(node.children, source, $getNestedContentRange(node, source)),
					$getDelimiter(node, source, "~~"),
				),
			];
		case "inlineCode": {
			const inlineCode = $getInlineCodeSource(node, source);
			return [$createMarkdownInlineCodeNode([$createTextNode(inlineCode.body)], inlineCode.syntax)];
		}
		case "link": {
			const range = $getSourceRange(node);
			if (!range || !$isCompletedExplicitMarkdownLink(node, source, range)) {
				return [$createTextNode($getSourceSlice(node, source))];
			}
			return [$createStructuredLink(node, source)];
		}
		case "break":
			return $createMarkdownBreakNodes(node, source);
		default:
			return [$createTextNode($getSourceSlice(node, source))];
	}
}

function $getSourceRange(node: MarkdownPhrasingContent): SourceRange | null {
	const start = node.position?.start.offset;
	const end = node.position?.end.offset;
	if (start === undefined || end === undefined) return null;
	return { start, end };
}

function $getSourceSlice(node: MarkdownPhrasingContent, source: string): string {
	const range = $getSourceRange(node);
	return range ? source.slice(range.start, range.end) : "";
}

function $getNestedContentRange(
	node: Extract<MarkdownPhrasingContent, { type: "strong" | "emphasis" | "delete" }>,
	source: string,
): SourceRange {
	const range = $getSourceRange(node);
	const first = node.children[0]?.position?.start.offset;
	const last = node.children.at(-1)?.position?.end.offset;
	if (range && first !== undefined && last !== undefined) return { start: first, end: last };
	return range ?? { start: 0, end: source.length };
}

function $getDelimiter(
	node: Extract<MarkdownPhrasingContent, { type: "strong" | "emphasis" | "delete" }>,
	source: string,
	fallback: string,
): string {
	const range = $getSourceRange(node);
	const first = node.children[0]?.position?.start.offset;
	const last = node.children.at(-1)?.position?.end.offset;
	if (range && first !== undefined && last !== undefined) {
		const opening = source.slice(range.start, first);
		const closing = source.slice(last, range.end);
		if (opening.length > 0 && opening === closing) return opening;
		if (opening.length > 0) return opening;
		if (closing.length > 0) return closing;
	}
	return fallback;
}

function $getInlineCodeSource(
	node: Extract<MarkdownPhrasingContent, { type: "inlineCode" }>,
	source: string,
): InlineCodeSource {
	const raw = $getSourceSlice(node, source);
	const opening = raw.match(/^`+/)?.[0] ?? "`";
	const closing = raw.match(/`+$/)?.[0] ?? opening;
	const bodyEnd = Math.max(opening.length, raw.length - closing.length);
	return {
		syntax: opening,
		body: raw.slice(opening.length, bodyEnd),
	};
}

function $isCompletedExplicitMarkdownLink(
	node: Extract<MarkdownPhrasingContent, { type: "link" }>,
	source: string,
	range: SourceRange,
) {
	return (
		explicitMarkdownLinkPattern.test(source.slice(range.start, range.end)) &&
		node.children.length > 0 &&
		node.url.trim().length > 0
	);
}

function $createMarkdownBreakNodes(
	node: Extract<MarkdownPhrasingContent, { type: "break" }>,
	source: string,
) {
	const raw = $getSourceSlice(node, source);
	const lineBreak = $createLineBreakNode();
	const prefix = raw.endsWith("\n") ? raw.slice(0, -1) : raw;
	return prefix.length > 0 ? [$createTextNode(prefix), lineBreak] : [lineBreak];
}

function $createStructuredLink(
	node: Extract<MarkdownPhrasingContent, { type: "link" }>,
	source: string,
) {
	const range = $getSourceRange(node);
	const first = node.children[0]?.position?.start.offset;
	const last = node.children.at(-1)?.position?.end.offset;
	const start = range?.start ?? 0;
	const end = range?.end ?? start;
	const separatorIndex =
		last === undefined ? source.indexOf("](", start) : source.indexOf("](", last);
	const labelStart = first ?? start + 1;
	const labelEnd = last ?? (separatorIndex >= start ? separatorIndex : labelStart);
	const separatorStart = separatorIndex >= labelEnd ? separatorIndex : labelEnd;
	const destinationStart = separatorIndex >= labelEnd ? separatorIndex + 2 : labelEnd;
	const suffixStart = end > start && source[end - 1] === ")" ? end - 1 : end;
	const urlEnd = $findLinkUrlEnd(source, destinationStart, suffixStart);
	const tokens: StructuredLinkSourceTokens = {
		prefix: source.slice(start, labelStart) || "[",
		separator: source.slice(separatorStart, destinationStart) || "](",
		url: source.slice(destinationStart, urlEnd) || node.url,
		suffix: source.slice(urlEnd, end) || ")",
	};
	return $createStructuredLinkNode(
		$buildMarkdownInlineNodes(node.children, source, {
			start: labelStart,
			end: labelEnd,
		}),
		node.url,
		node.title ?? null,
		tokens,
	);
}

function $findLinkUrlEnd(source: string, start: number, end: number): number {
	if (start >= end) return start;
	if (source[start] === "<") {
		const closingAngle = source.indexOf(">", start + 1);
		if (closingAngle >= start && closingAngle < end) return closingAngle + 1;
	}
	let cursor = start;
	while (cursor < end && !/\s/.test(source[cursor] ?? "")) cursor += 1;
	return cursor;
}
