import { $isLinkNode, LinkNode } from "@lexical/link";
import {
	$createParagraphNode,
	$createRangeSelection,
	$createTextNode,
	$getRoot,
	$getSelection,
	$isParagraphNode,
	$isRangeSelection,
	$isTextNode,
	$setSelection,
	createEditor,
} from "lexical";
import { describe, expect, it } from "vitest";

import {
	$isMarkdownBoldNode,
	MarkdownBoldNode,
	MarkdownInlineCodeNode,
	MarkdownItalicNode,
	MarkdownStrikethroughNode,
} from "#editor/inline/nodes";
import { $insertMarkdownLinkSource } from "#editor/link/source";
import {
	$getMarkdownBlockRawSource,
	$getMarkdownBlockSelectionSnapshot,
} from "#editor/shared/block-source";
import { MarkdownInlineMarkerNode } from "#editor/shared/marker-node";

function createLinkSourceEditor() {
	return createEditor({
		namespace: "MarkdownLinkSourceTest",
		nodes: [
			LinkNode,
			MarkdownBoldNode,
			MarkdownItalicNode,
			MarkdownStrikethroughNode,
			MarkdownInlineCodeNode,
			MarkdownInlineMarkerNode,
		],
		onError: (error) => {
			throw error;
		},
	});
}

function appendRawParagraph(editor: ReturnType<typeof createLinkSourceEditor>, source: string) {
	let textKey = "";
	editor.update(
		() => {
			const paragraph = $createParagraphNode();
			const text = $createTextNode(source);
			textKey = text.getKey();
			paragraph.append(text);
			$getRoot().append(paragraph);
			const selection = $createRangeSelection();
			selection.setTextNodeRange(text, 0, text, 0);
			$setSelection(selection);
		},
		{ discrete: true },
	);
	return textKey;
}

describe("$insertMarkdownLinkSource", () => {
	it("wraps selected raw syntax and preserves nested inline owners", () => {
		const editor = createLinkSourceEditor();
		const source = "before **bold** after";
		const textKey = appendRawParagraph(editor, source);

		editor.update(
			() => {
				const paragraph = $getRoot().getFirstChild();
				const selection = $getSelection();
				if (!$isParagraphNode(paragraph) || !$isRangeSelection(selection)) return;
				const text = paragraph.getFirstChild();
				if (!$isTextNode(text) || text.getKey() !== textKey) return;
				selection.setTextNodeRange(text, 7, text, 15);
				expect(
					$insertMarkdownLinkSource(
						paragraph,
						selection,
						"ignored-for-selected-text",
						"https://example.test",
					),
				).toBe(true);
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			expect($isParagraphNode(paragraph)).toBe(true);
			if (!$isParagraphNode(paragraph)) return;
			expect($getMarkdownBlockRawSource(paragraph)).toBe(
				"before [**bold**](https://example.test) after",
			);
			const link = paragraph.getChildren().find($isLinkNode);
			expect($isLinkNode(link)).toBe(true);
			if (!$isLinkNode(link)) return;
			expect(link.getChildren().some($isMarkdownBoldNode)).toBe(true);
			const selection = $getSelection();
			expect($isRangeSelection(selection)).toBe(true);
			if (!$isRangeSelection(selection)) return;
			const snapshot = $getMarkdownBlockSelectionSnapshot(selection);
			expect(snapshot?.anchorOffset).toBe(8);
			expect(snapshot?.focusOffset).toBe(16);
		});
	});

	it("inserts a collapsed link and places the caret after it", () => {
		const editor = createLinkSourceEditor();
		appendRawParagraph(editor, "hello ");

		editor.update(
			() => {
				const paragraph = $getRoot().getFirstChild();
				const selection = $getSelection();
				if (!$isParagraphNode(paragraph) || !$isRangeSelection(selection)) return;
				const text = paragraph.getFirstChild();
				if (!$isTextNode(text)) return;
				selection.setTextNodeRange(text, 6, text, 6);
				$insertMarkdownLinkSource(paragraph, selection, "example.com", "https://example.com");
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			expect($isParagraphNode(paragraph)).toBe(true);
			if (!$isParagraphNode(paragraph)) return;
			expect($getMarkdownBlockRawSource(paragraph)).toBe(
				"hello [example.com](https://example.com)",
			);
			const selection = $getSelection();
			expect($isRangeSelection(selection)).toBe(true);
			if (!$isRangeSelection(selection)) return;
			const snapshot = $getMarkdownBlockSelectionSnapshot(selection);
			expect(snapshot?.anchorOffset).toBe(40);
			expect(snapshot?.focusOffset).toBe(40);
		});
	});

	it("does nothing for a selection spanning two blocks", () => {
		const editor = createLinkSourceEditor();
		editor.update(
			() => {
				const first = $createParagraphNode();
				const firstText = $createTextNode("one");
				first.append(firstText);
				const second = $createParagraphNode();
				const secondText = $createTextNode("two");
				second.append(secondText);
				$getRoot().append(first, second);
				const selection = $createRangeSelection();
				selection.setTextNodeRange(firstText, 1, secondText, 1);
				$setSelection(selection);
				expect($insertMarkdownLinkSource(first, selection, "label", "https://example.test")).toBe(
					false,
				);
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const root = $getRoot();
			expect(root.getFirstChild()?.getTextContent()).toBe("one");
			expect(root.getLastChild()?.getTextContent()).toBe("two");
		});
	});
});
