import {
	$createParagraphNode,
	$createRangeSelection,
	$createTextNode,
	$getRoot,
	$getSelection,
	$isElementNode,
	$isRangeSelection,
	$isTextNode,
	$setSelection,
	createEditor,
} from "lexical";
import { describe, expect, it } from "vitest";

import { $createMarkdownBoldNode, MarkdownBoldNode } from "#editor/inline/nodes";
import {
	$getMarkdownBlockOffset,
	$getMarkdownBlockRawSource,
	$getMarkdownBlockSelectionSnapshot,
	$getTopLevelMarkdownBlock,
} from "#editor/shared/block-source";
import { MarkdownInlineMarkerNode } from "#editor/shared/marker-node";

function createBlockSourceEditor() {
	return createEditor({
		namespace: "MarkdownBlockSourceTest",
		nodes: [MarkdownBoldNode, MarkdownInlineMarkerNode],
		onError: (error) => {
			throw error;
		},
	});
}

describe("markdown block source helpers", () => {
	it("returns plain block text and text/element offsets", () => {
		const editor = createBlockSourceEditor();
		let blockKey = "";
		let textKey = "";

		editor.update(
			() => {
				const block = $createParagraphNode();
				const text = $createTextNode("hello");
				blockKey = block.getKey();
				textKey = text.getKey();
				block.append(text);
				$getRoot().append(block);
				const selection = $createRangeSelection();
				selection.setTextNodeRange(text, 2, text, 2);
				$setSelection(selection);
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const block = $getRoot().getFirstChild();
			expect($isElementNode(block)).toBe(true);
			if (!$isElementNode(block)) return;
			const text = block.getFirstChild();
			expect($isTextNode(text)).toBe(true);
			if (!$isTextNode(text)) return;
			expect(block.getKey()).toBe(blockKey);
			expect(text.getKey()).toBe(textKey);
			expect($getTopLevelMarkdownBlock(text)).toBe(block);
			expect($getMarkdownBlockRawSource(block)).toBe("hello");
			const selection = $getSelection();
			expect($isRangeSelection(selection)).toBe(true);
			if (!$isRangeSelection(selection)) return;
			expect($getMarkdownBlockOffset(block, selection.anchor)).toBe(2);

			const elementSelection = $createRangeSelection();
			elementSelection.anchor.set(block.getKey(), 0, "element");
			elementSelection.focus.set(block.getKey(), 0, "element");
			expect($getMarkdownBlockOffset(block, elementSelection.anchor)).toBe(0);
			elementSelection.anchor.set(block.getKey(), 1, "element");
			elementSelection.focus.set(block.getKey(), 1, "element");
			expect($getMarkdownBlockOffset(block, elementSelection.anchor)).toBe(5);
		});
	});

	it("includes nested marker text and snapshots range selection direction", () => {
		const editor = createBlockSourceEditor();
		let blockKey = "";
		let bodyKey = "";
		let afterKey = "";

		editor.update(
			() => {
				const block = $createParagraphNode();
				const body = $createTextNode("hello");
				const owner = $createMarkdownBoldNode([body]);
				const after = $createTextNode("!");
				blockKey = block.getKey();
				bodyKey = body.getKey();
				afterKey = after.getKey();
				block.append(owner, after);
				$getRoot().append(block);
				const selection = $createRangeSelection();
				selection.setTextNodeRange(body, 1, after, 1);
				$setSelection(selection);
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const block = $getRoot().getFirstChild();
			expect($isElementNode(block)).toBe(true);
			if (!$isElementNode(block)) return;
			const owner = block.getFirstChild();
			expect($isElementNode(owner)).toBe(true);
			if (!$isElementNode(owner)) return;
			const body = owner.getChildAtIndex(1);
			expect($isTextNode(body)).toBe(true);
			if (!$isTextNode(body)) return;
			expect(block.getKey()).toBe(blockKey);
			expect(body.getKey()).toBe(bodyKey);
			expect($getMarkdownBlockRawSource(block)).toBe("**hello**!");
			const ownerSelection = $createRangeSelection();
			ownerSelection.anchor.set(owner.getKey(), 1, "element");
			ownerSelection.focus.set(owner.getKey(), 1, "element");
			expect($getMarkdownBlockOffset(block, ownerSelection.anchor)).toBe(2);
			ownerSelection.anchor.set(owner.getKey(), 2, "element");
			ownerSelection.focus.set(owner.getKey(), 2, "element");
			expect($getMarkdownBlockOffset(block, ownerSelection.anchor)).toBe(7);
			const selection = $getSelection();
			expect($isRangeSelection(selection)).toBe(true);
			if (!$isRangeSelection(selection)) return;
			const snapshot = $getMarkdownBlockSelectionSnapshot(selection);
			expect(snapshot?.block).toBe(block);
			expect(snapshot?.anchorOffset).toBe(3);
			expect(snapshot?.focusOffset).toBe(10);
			expect(snapshot?.isBackward).toBe(false);
			expect(selection.focus.key).toBe(afterKey);
		});

		editor.update(
			() => {
				const block = $getRoot().getFirstChild();
				if (!$isElementNode(block)) return;
				const owner = block.getFirstChild();
				if (!$isElementNode(owner)) return;
				const body = owner.getChildAtIndex(1);
				const after = block.getLastChild();
				if (!$isTextNode(body) || !$isTextNode(after)) return;
				const selection = $createRangeSelection();
				selection.setTextNodeRange(after, 1, body, 1);
				$setSelection(selection);
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const selection = $getSelection();
			if (!$isRangeSelection(selection)) return;
			const snapshot = $getMarkdownBlockSelectionSnapshot(selection);
			expect(snapshot?.anchorOffset).toBe(10);
			expect(snapshot?.focusOffset).toBe(3);
			expect(snapshot?.isBackward).toBe(true);
		});
	});

	it("returns null for a point outside the requested block", () => {
		const editor = createBlockSourceEditor();
		let firstBlockKey = "";
		let outsideKey = "";

		editor.update(
			() => {
				const first = $createParagraphNode();
				const second = $createParagraphNode();
				const outside = $createTextNode("outside");
				firstBlockKey = first.getKey();
				outsideKey = outside.getKey();
				first.append($createTextNode("inside"));
				second.append(outside);
				$getRoot().append(first, second);
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const first = $getRoot().getFirstChild();
			expect($isElementNode(first)).toBe(true);
			if (!$isElementNode(first)) return;
			const last = $getRoot().getLastChild();
			expect($isElementNode(last)).toBe(true);
			if (!$isElementNode(last)) return;
			const outside = last.getFirstChild();
			expect($isTextNode(outside)).toBe(true);
			if (!$isTextNode(outside)) return;
			expect(first.getKey()).toBe(firstBlockKey);
			expect(outside.getKey()).toBe(outsideKey);
			const selection = $createRangeSelection();
			selection.setTextNodeRange(outside, 0, outside, 0);
			expect($getMarkdownBlockOffset(first, selection.anchor)).toBeNull();
		});
	});
});
