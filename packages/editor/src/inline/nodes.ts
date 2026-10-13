import type { TextMatchTransformer } from "@lexical/markdown";
import {
	$applyNodeReplacement,
	$getDocument,
	$setState,
	createState,
	ElementNode,
	type EditorConfig,
	type LexicalNode,
	type NodeKey,
	type SerializedElementNode,
} from "lexical";

import {
	$createMarkdownInlineMarkerNode,
	$isMarkdownInlineMarkerNode,
	MarkdownInlineMarkerNode,
} from "#editor/shared/marker-node";

export type MarkdownInlineFormat = "bold" | "italic" | "strikethrough" | "code";

export class MarkdownInlineFormatNode extends ElementNode {
	$config() {
		return this.config(Symbol.for("MarkdownInlineFormatNode"), { extends: ElementNode });
	}

	constructor(key?: NodeKey) {
		super(key);
	}

	isInline(): true {
		return true;
	}

	canBeEmpty(): true {
		return true;
	}
}

export interface MarkdownBoldStructureState {
	role: "markdownBoldStructure";
	initialized: boolean;
}

export const markdownBoldStructureState = createState("markdownBoldStructure", {
	parse: (value): MarkdownBoldStructureState =>
		isRecord(value) &&
		value.role === "markdownBoldStructure" &&
		typeof value.initialized === "boolean"
			? { role: "markdownBoldStructure", initialized: value.initialized }
			: { role: "markdownBoldStructure", initialized: false },
	resetOnCopyNode: true,
});

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export function $createMarkdownBoldStructureState(
	initialized: boolean,
): MarkdownBoldStructureState {
	return { role: "markdownBoldStructure", initialized };
}

function $createFormatMarker(syntax: string, side: "prefix" | "suffix") {
	return $createMarkdownInlineMarkerNode(syntax, side);
}

export class MarkdownBoldNode extends MarkdownInlineFormatNode {
	$config() {
		return this.config("markdown-bold", { extends: MarkdownInlineFormatNode });
	}

	constructor(key?: NodeKey) {
		super(key);
	}

	static clone(node: MarkdownBoldNode) {
		return new MarkdownBoldNode(node.getKey());
	}

	createDOM(_config: EditorConfig): HTMLElement {
		const element = $getDocument().createElement("strong");
		element.setAttribute("data-markdown-bold", "true");
		return element;
	}

	updateDOM(_prevNode: this, dom: HTMLElement): boolean {
		dom.setAttribute("data-markdown-bold", "true");
		return false;
	}

	static importJSON(serializedNode: SerializedElementNode) {
		return $applyNodeReplacement(new MarkdownBoldNode()).updateFromJSON(serializedNode);
	}
}

export function $createUninitializedMarkdownBoldNode() {
	return $applyNodeReplacement(new MarkdownBoldNode());
}

export function $createMarkdownBoldNode(content: LexicalNode[] = [], syntax = "**") {
	const node = $createUninitializedMarkdownBoldNode();
	node.append(
		$createFormatMarker(syntax, "prefix"),
		...content,
		$createFormatMarker(syntax, "suffix"),
	);
	$setState(node, markdownBoldStructureState, $createMarkdownBoldStructureState(true));
	return node;
}

export function $isMarkdownBoldNode(
	node: LexicalNode | null | undefined,
): node is MarkdownBoldNode {
	return node instanceof MarkdownBoldNode;
}

export class MarkdownItalicNode extends MarkdownInlineFormatNode {
	$config() {
		return this.config("markdown-italic", { extends: MarkdownInlineFormatNode });
	}

	constructor(key?: NodeKey) {
		super(key);
	}

	static clone(node: MarkdownItalicNode) {
		return new MarkdownItalicNode(node.getKey());
	}

	createDOM(_config: EditorConfig): HTMLElement {
		return $getDocument().createElement("em");
	}

	updateDOM(_prevNode: this, _dom: HTMLElement): boolean {
		return false;
	}

	static importJSON(serializedNode: SerializedElementNode) {
		return $applyNodeReplacement(new MarkdownItalicNode()).updateFromJSON(serializedNode);
	}
}

export function $createMarkdownItalicNode(content: LexicalNode[] = [], syntax = "*") {
	const node = $applyNodeReplacement(new MarkdownItalicNode());
	node.append(
		$createFormatMarker(syntax, "prefix"),
		...content,
		$createFormatMarker(syntax, "suffix"),
	);
	return node;
}

export function $isMarkdownItalicNode(
	node: LexicalNode | null | undefined,
): node is MarkdownItalicNode {
	return node instanceof MarkdownItalicNode;
}

export class MarkdownStrikethroughNode extends MarkdownInlineFormatNode {
	$config() {
		return this.config("markdown-strikethrough", { extends: MarkdownInlineFormatNode });
	}

	constructor(key?: NodeKey) {
		super(key);
	}

	static clone(node: MarkdownStrikethroughNode) {
		return new MarkdownStrikethroughNode(node.getKey());
	}

	createDOM(_config: EditorConfig): HTMLElement {
		return $getDocument().createElement("del");
	}

	updateDOM(_prevNode: this, _dom: HTMLElement): boolean {
		return false;
	}

	static importJSON(serializedNode: SerializedElementNode) {
		return $applyNodeReplacement(new MarkdownStrikethroughNode()).updateFromJSON(serializedNode);
	}
}

export function $createMarkdownStrikethroughNode(content: LexicalNode[] = [], syntax = "~~") {
	const node = $applyNodeReplacement(new MarkdownStrikethroughNode());
	node.append(
		$createFormatMarker(syntax, "prefix"),
		...content,
		$createFormatMarker(syntax, "suffix"),
	);
	return node;
}

export function $isMarkdownStrikethroughNode(
	node: LexicalNode | null | undefined,
): node is MarkdownStrikethroughNode {
	return node instanceof MarkdownStrikethroughNode;
}

export class MarkdownInlineCodeNode extends MarkdownInlineFormatNode {
	$config() {
		return this.config("markdown-inline-code", { extends: MarkdownInlineFormatNode });
	}

	constructor(key?: NodeKey) {
		super(key);
	}

	static clone(node: MarkdownInlineCodeNode) {
		return new MarkdownInlineCodeNode(node.getKey());
	}

	createDOM(_config: EditorConfig): HTMLElement {
		return $getDocument().createElement("code");
	}

	updateDOM(_prevNode: this, _dom: HTMLElement): boolean {
		return false;
	}

	static importJSON(serializedNode: SerializedElementNode) {
		return $applyNodeReplacement(new MarkdownInlineCodeNode()).updateFromJSON(serializedNode);
	}
}

export function $createMarkdownInlineCodeNode(content: LexicalNode[] = [], syntax = "`") {
	const node = $applyNodeReplacement(new MarkdownInlineCodeNode());
	node.append(
		$createFormatMarker(syntax, "prefix"),
		...content,
		$createFormatMarker(syntax, "suffix"),
	);
	return node;
}

export function $isMarkdownInlineCodeNode(
	node: LexicalNode | null | undefined,
): node is MarkdownInlineCodeNode {
	return node instanceof MarkdownInlineCodeNode;
}

function $isMarkdownInlineFormatNode(
	node: LexicalNode | null | undefined,
): node is MarkdownInlineFormatNode {
	return (
		$isMarkdownBoldNode(node) ||
		$isMarkdownItalicNode(node) ||
		$isMarkdownStrikethroughNode(node) ||
		$isMarkdownInlineCodeNode(node)
	);
}

function $exportMarkdownInlineFormat(
	node: LexicalNode,
	exportChildren: (node: ElementNode) => string,
	owner: MarkdownInlineFormatNode,
) {
	if (node !== owner) return null;
	const first = owner.getFirstChild();
	const last = owner.getLastChild();
	if (!$isMarkdownInlineMarkerNode(first) || !$isMarkdownInlineMarkerNode(last)) return null;
	if (first === last || first.getMarkerSide() !== "prefix" || last.getMarkerSide() !== "suffix") {
		return null;
	}
	return `${first.getTextContent()}${exportChildren(owner)}${last.getTextContent()}`;
}

export const MARKDOWN_INLINE_FORMAT_MARKER_TRANSFORMER = {
	dependencies: [MarkdownInlineMarkerNode],
	export: (node: LexicalNode, _exportChildren: (node: ElementNode) => string) => {
		if (!$isMarkdownInlineMarkerNode(node)) return null;
		return $isMarkdownInlineFormatNode(node.getParent()) ? "" : node.getTextContent();
	},
	regExp: /$^/,
	type: "text-match",
} satisfies TextMatchTransformer;

export const MARKDOWN_INLINE_FORMAT_TRANSFORMERS = [
	{
		dependencies: [MarkdownBoldNode],
		export: (node: LexicalNode, exportChildren: (node: ElementNode) => string) =>
			$isMarkdownBoldNode(node) ? $exportMarkdownInlineFormat(node, exportChildren, node) : null,
		regExp: /$^/,
		type: "text-match",
	},
	{
		dependencies: [MarkdownItalicNode],
		export: (node: LexicalNode, exportChildren: (node: ElementNode) => string) =>
			$isMarkdownItalicNode(node) ? $exportMarkdownInlineFormat(node, exportChildren, node) : null,
		regExp: /$^/,
		type: "text-match",
	},
	{
		dependencies: [MarkdownStrikethroughNode],
		export: (node: LexicalNode, exportChildren: (node: ElementNode) => string) =>
			$isMarkdownStrikethroughNode(node)
				? $exportMarkdownInlineFormat(node, exportChildren, node)
				: null,
		regExp: /$^/,
		type: "text-match",
	},
	{
		dependencies: [MarkdownInlineCodeNode],
		export: (node: LexicalNode, exportChildren: (node: ElementNode) => string) =>
			$isMarkdownInlineCodeNode(node)
				? $exportMarkdownInlineFormat(node, exportChildren, node)
				: null,
		regExp: /$^/,
		type: "text-match",
	},
] satisfies TextMatchTransformer[];
