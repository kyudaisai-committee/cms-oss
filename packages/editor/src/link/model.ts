import { $createLinkNode, $isLinkNode, LinkNode } from "@lexical/link";
import { LINK } from "@lexical/markdown";
import type { TextMatchTransformer } from "@lexical/markdown";
import { $createTextNode, $isElementNode, $isTextNode, TextNode, type LexicalNode } from "lexical";

import {
	$createMarkdownInlineMarkerNode,
	$isMarkdownInlineMarkerNode,
	MarkdownInlineMarkerNode,
} from "#editor/shared/marker-node";

export type StructuredLinkRole = "prefix" | "label" | "separator" | "url" | "suffix";

export interface StructuredLinkSourceTokens {
	prefix: string;
	separator: string;
	url: string;
	suffix: string;
}

interface StructuredLinkParts {
	prefix: MarkdownInlineMarkerNode;
	separator: MarkdownInlineMarkerNode;
	url: TextNode;
	suffix: MarkdownInlineMarkerNode;
	separatorIndex: number;
	urlIndex: number;
	suffixIndex: number;
}

function $getStructuredLinkParts(node: LexicalNode): StructuredLinkParts | null {
	if (!$isLinkNode(node)) return null;
	const children = node.getChildren();
	if (children.length < 4) return null;

	const first = children[0];
	const last = children.at(-1);
	if (
		!$isMarkdownInlineMarkerNode(first) ||
		first.getMarkerSide() !== "prefix" ||
		first.getTextContent() !== "[" ||
		!$isMarkdownInlineMarkerNode(last) ||
		last.getMarkerSide() !== "suffix" ||
		!last.getTextContent().endsWith(")")
	) {
		return null;
	}

	const separatorIndex = children.findIndex(
		(child, index) =>
			index > 0 &&
			index < children.length - 2 &&
			$isMarkdownInlineMarkerNode(child) &&
			child.getMarkerSide() === "suffix" &&
			child.getTextContent().startsWith("]("),
	);
	if (separatorIndex < 0) return null;
	const labelChildren = children.slice(1, separatorIndex);
	if (labelChildren.every((child) => $getVisibleLinkLabelLength(child) === 0)) return null;

	const urlIndex = separatorIndex + 1;
	const url = children[urlIndex];
	const separator = children[separatorIndex];
	if (
		!$isMarkdownInlineMarkerNode(separator) ||
		!$isTextNode(url) ||
		$isMarkdownInlineMarkerNode(url)
	)
		return null;

	return {
		prefix: first,
		separator,
		url,
		suffix: last,
		separatorIndex,
		urlIndex,
		suffixIndex: children.length - 1,
	};
}

function $getVisibleLinkLabelLength(node: LexicalNode): number {
	if ($isMarkdownInlineMarkerNode(node)) return 0;
	if (!$isElementNode(node)) return node.getTextContentSize();
	return node
		.getChildren()
		.reduce((length, child) => length + $getVisibleLinkLabelLength(child), 0);
}

export function $isStructuredLink(node: LexicalNode): boolean {
	return $getStructuredLinkParts(node) !== null;
}

export function $getStructuredLinkRole(node: LexicalNode): StructuredLinkRole | null {
	const parent = node.getParent();
	if (!parent) return null;
	const parts = $getStructuredLinkParts(parent);
	if (!parts) return null;
	const index = node.getIndexWithinParent();
	if (index === 0 && node === parts.prefix) return "prefix";
	if (index === parts.separatorIndex && node === parts.separator) return "separator";
	if (index === parts.urlIndex && node === parts.url) return "url";
	if (index === parts.suffixIndex && node === parts.suffix) return "suffix";
	if (index > 0 && index < parts.separatorIndex) return "label";
	return null;
}

export function $createStructuredLinkNode(
	labelChildren: LexicalNode[],
	url: string,
	title: string | null = null,
	tokens: StructuredLinkSourceTokens = {
		prefix: "[",
		separator: "](",
		url,
		suffix: ")",
	},
) {
	const suffix =
		title !== null && tokens.suffix === ")"
			? ` "${title.replace(/[\\"]/g, "\\$&")}")`
			: tokens.suffix;
	const linkNode = $createLinkNode(url, title === null ? undefined : { title });
	linkNode.append(
		$createMarkdownInlineMarkerNode(tokens.prefix, "prefix"),
		...labelChildren,
		$createMarkdownInlineMarkerNode(tokens.separator, "suffix"),
		$createTextNode(tokens.url),
		$createMarkdownInlineMarkerNode(suffix, "suffix"),
	);
	return linkNode;
}

export function $setStructuredLinkUrl(linkNode: LinkNode, url: string) {
	const parts = $getStructuredLinkParts(linkNode);
	if (!parts) {
		linkNode.setURL(url);
		return;
	}
	parts.url.setTextContent(url);
	linkNode.setURL(url);
}

export function $collectStructuredLinks(node: LexicalNode, links: LinkNode[]) {
	if ($isLinkNode(node) && $isStructuredLink(node)) {
		links.push(node);
		return;
	}
	if (!$isElementNode(node)) return;
	for (const child of node.getChildren()) $collectStructuredLinks(child, links);
}

export const STRUCTURED_LINK_TRANSFORMER = {
	dependencies: [LinkNode, MarkdownInlineMarkerNode],
	export: (node: LexicalNode) => {
		if (!$isLinkNode(node)) return null;
		const parts = $getStructuredLinkParts(node);
		if (!parts) return null;
		const label = node
			.getChildren()
			.slice(1, parts.separatorIndex)
			.map((child) => child.getTextContent())
			.join("");
		return `${parts.prefix.getTextContent()}${label}${parts.separator.getTextContent()}${parts.url.getTextContent()}${parts.suffix.getTextContent()}`;
	},
	regExp: LINK.regExp,
	type: "text-match",
} satisfies TextMatchTransformer;
