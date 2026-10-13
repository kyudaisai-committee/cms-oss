import { $isCodeNode } from "@lexical/code";
import { $isListNode } from "@lexical/list";
import type { ListNode } from "@lexical/list";
import { $isHeadingNode, $isQuoteNode } from "@lexical/rich-text";
import type { LexicalNode } from "lexical";

export function $findBlockAncestor(node: LexicalNode): LexicalNode | null {
	let current: LexicalNode | null = node;
	while (current) {
		if ($isCodeNode(current) || $isHeadingNode(current) || $isQuoteNode(current)) return current;
		current = current.getParent();
	}
	return null;
}

export function $findListAncestor(node: LexicalNode): ListNode | null {
	let current: LexicalNode | null = node;
	while (current) {
		if ($isListNode(current)) return current;
		current = current.getParent();
	}
	return null;
}
