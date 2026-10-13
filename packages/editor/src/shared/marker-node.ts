import {
	$applyNodeReplacement,
	TextNode,
	type EditorConfig,
	type LexicalNode,
	type LexicalUpdateJSON,
	type NodeKey,
	type SerializedTextNode,
	type Spread,
} from "lexical";

export type InlineMarkerSide = "prefix" | "suffix";

export type SerializedMarkdownInlineMarkerNode = Spread<
	{
		side: InlineMarkerSide;
	},
	SerializedTextNode
>;

export class MarkdownInlineMarkerNode extends TextNode {
	__markerSide: InlineMarkerSide;

	$config() {
		return this.config("markdown-inline-marker", { extends: TextNode });
	}

	constructor(text = "", side: InlineMarkerSide = "prefix", key?: NodeKey) {
		super(text, key);
		this.__markerSide = side;
	}

	afterCloneFrom(prevNode: this): void {
		super.afterCloneFrom(prevNode);
		this.__markerSide = prevNode.__markerSide;
	}

	getMarkerSide(): InlineMarkerSide {
		return this.getLatest().__markerSide;
	}

	setMarkerSide(side: InlineMarkerSide): this {
		this.getWritable().__markerSide = side;
		return this;
	}

	createDOM(config: EditorConfig): HTMLElement {
		const element = super.createDOM(config);
		element.setAttribute("data-markdown-inline-marker", "true");
		element.setAttribute("data-markdown-inline-marker-side", this.getMarkerSide());
		return element;
	}

	updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
		const shouldReplace = super.updateDOM(prevNode, dom, config);
		dom.setAttribute("data-markdown-inline-marker", "true");
		dom.setAttribute("data-markdown-inline-marker-side", this.getMarkerSide());
		return shouldReplace;
	}

	updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedMarkdownInlineMarkerNode>): this {
		return super
			.updateFromJSON(serializedNode)
			.setMarkerSide(serializedNode.side === "suffix" ? "suffix" : "prefix");
	}

	exportJSON(): SerializedMarkdownInlineMarkerNode {
		return {
			...super.exportJSON(),
			side: this.getMarkerSide(),
		};
	}

	static importJSON(serializedNode: SerializedMarkdownInlineMarkerNode) {
		return $createMarkdownInlineMarkerNode(serializedNode.text, serializedNode.side).updateFromJSON(
			serializedNode,
		);
	}
}

function $applyUnmergeableInlineMarker(node: MarkdownInlineMarkerNode) {
	const appliedNode = $applyNodeReplacement(node);
	if (!appliedNode.isUnmergeable()) appliedNode.toggleUnmergeable();
	return appliedNode;
}

export function $createMarkdownInlineMarkerNode(text: string, side: InlineMarkerSide) {
	return $applyUnmergeableInlineMarker(new MarkdownInlineMarkerNode(text, side));
}

export function $isMarkdownInlineMarkerNode(
	node: LexicalNode | null | undefined,
): node is MarkdownInlineMarkerNode {
	return node instanceof MarkdownInlineMarkerNode;
}
