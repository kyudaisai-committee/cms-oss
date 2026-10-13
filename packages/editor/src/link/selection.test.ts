import { LinkNode } from "@lexical/link";
import {
	$createParagraphNode,
	$createRangeSelection,
	$createTextNode,
	$getRoot,
	$setSelection,
	createEditor,
	type NodeKey,
} from "lexical";
import { describe, expect, it } from "vitest";

import { $createStructuredLinkNode } from "#editor/link/model";
import { $collectActiveStructuredLinkKeys } from "#editor/link/selection";
import { MarkdownInlineMarkerNode } from "#editor/shared/marker-node";

function createLinkSelectionEditor() {
	return createEditor({
		namespace: "LinkSelectionTest",
		nodes: [LinkNode, MarkdownInlineMarkerNode],
		onError: (error) => {
			throw error;
		},
	});
}

describe("$collectActiveStructuredLinkKeys", () => {
	it("activates structured link when caret is inside label or URL", () => {
		const editor = createLinkSelectionEditor();
		let linkKey = "";

		editor.update(
			() => {
				const paragraph = $createParagraphNode();
				const labelNode = $createTextNode("example");
				const link = $createStructuredLinkNode([labelNode], "https://example.com");
				linkKey = link.getKey();
				paragraph.append($createTextNode("before "), link, $createTextNode(" after"));
				$getRoot().append(paragraph);

				const selection = $createRangeSelection();
				selection.setTextNodeRange(labelNode, 2, labelNode, 2);
				$setSelection(selection);

				const activeKeys = new Set<NodeKey>();
				$collectActiveStructuredLinkKeys(selection, activeKeys);
				expect(activeKeys.has(linkKey)).toBe(true);
			},
			{ discrete: true },
		);
	});

	it("activates structured link when caret is at the boundary before or after the link", () => {
		const editor = createLinkSelectionEditor();
		let linkKey = "";

		editor.update(
			() => {
				const paragraph = $createParagraphNode();
				const beforeText = $createTextNode("before ");
				const afterText = $createTextNode(" after");
				const labelNode = $createTextNode("example");
				const link = $createStructuredLinkNode([labelNode], "https://example.com");
				linkKey = link.getKey();
				paragraph.append(beforeText, link, afterText);
				$getRoot().append(paragraph);

				// Caret at the end of beforeText (immediately before link)
				const selectionBefore = $createRangeSelection();
				selectionBefore.setTextNodeRange(
					beforeText,
					beforeText.getTextContentSize(),
					beforeText,
					beforeText.getTextContentSize(),
				);
				const activeKeysBefore = new Set<NodeKey>();
				$collectActiveStructuredLinkKeys(selectionBefore, activeKeysBefore);
				expect(activeKeysBefore.has(linkKey)).toBe(true);

				// Caret at the start of afterText (immediately after link)
				const selectionAfter = $createRangeSelection();
				selectionAfter.setTextNodeRange(afterText, 0, afterText, 0);
				const activeKeysAfter = new Set<NodeKey>();
				$collectActiveStructuredLinkKeys(selectionAfter, activeKeysAfter);
				expect(activeKeysAfter.has(linkKey)).toBe(true);
			},
			{ discrete: true },
		);
	});

	it("does not activate structured link when caret is away from the link", () => {
		const editor = createLinkSelectionEditor();
		let linkKey = "";

		editor.update(
			() => {
				const paragraph = $createParagraphNode();
				const beforeText = $createTextNode("before ");
				const afterText = $createTextNode(" after");
				const labelNode = $createTextNode("example");
				const link = $createStructuredLinkNode([labelNode], "https://example.com");
				linkKey = link.getKey();
				paragraph.append(beforeText, link, afterText);
				$getRoot().append(paragraph);

				const selection = $createRangeSelection();
				selection.setTextNodeRange(beforeText, 0, beforeText, 0);
				const activeKeys = new Set<NodeKey>();
				$collectActiveStructuredLinkKeys(selection, activeKeys);
				expect(activeKeys.has(linkKey)).toBe(false);
			},
			{ discrete: true },
		);
	});
});
