import { $isLinkNode, LinkNode } from "@lexical/link";
import {
	$createParagraphNode,
	$createRangeSelection,
	$createTextNode,
	$getRoot,
	$getSelection,
	$isElementNode,
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
import { $reconcileMarkdownParagraph } from "#editor/paragraph/reconcile";
import { $getMarkdownBlockSelectionSnapshot } from "#editor/shared/block-source";
import { $isMarkdownInlineMarkerNode, MarkdownInlineMarkerNode } from "#editor/shared/marker-node";

function createReconcileEditor() {
	return createEditor({
		namespace: "MarkdownParagraphReconcileTest",
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

function appendRawParagraph(editor: ReturnType<typeof createReconcileEditor>, source: string) {
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

describe("$reconcileMarkdownParagraph", () => {
	it("keeps literal asterisks literal and canonicalizes a valid bold span", () => {
		const editor = createReconcileEditor();
		appendRawParagraph(editor, "before **** after");
		let changed = false;
		editor.update(
			() => {
				const paragraph = $getRoot().getFirstChild();
				if (!$isParagraphNode(paragraph)) return;
				changed = $reconcileMarkdownParagraph(paragraph);
			},
			{ discrete: true },
		);
		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			expect(changed).toBe(true);
			expect($isElementNode(paragraph)).toBe(true);
			if (!$isElementNode(paragraph)) return;
			expect(paragraph.getTextContent()).toBe("before **** after");
			expect(paragraph.getChildren().some($isMarkdownBoldNode)).toBe(false);
		});

		const boldEditor = createReconcileEditor();
		appendRawParagraph(boldEditor, "**x**");
		boldEditor.update(
			() => {
				const paragraph = $getRoot().getFirstChild();
				if (!$isParagraphNode(paragraph)) return;
				$reconcileMarkdownParagraph(paragraph);
			},
			{ discrete: true },
		);
		boldEditor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			expect($isElementNode(paragraph)).toBe(true);
			if (!$isElementNode(paragraph)) return;
			expect($isMarkdownBoldNode(paragraph.getFirstChild())).toBe(true);
			expect(paragraph.getTextContent()).toBe("**x**");
		});
	});

	it("preserves nested inline/link content and content caret offsets", () => {
		const source = "abc **a *b* c** [label](url) def";
		const editor = createReconcileEditor();
		appendRawParagraph(editor, source);
		editor.update(
			() => {
				const paragraph = $getRoot().getFirstChild();
				const selection = $getSelection();
				if (!$isParagraphNode(paragraph) || !$isRangeSelection(selection)) return;
				const text = paragraph.getFirstChild();
				if (!$isTextNode(text)) return;
				selection.setTextNodeRange(text, 10, text, 10);
				$reconcileMarkdownParagraph(paragraph);
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			expect($isElementNode(paragraph)).toBe(true);
			if (!$isElementNode(paragraph)) return;
			expect(paragraph.getTextContent()).toBe(source);
			expect(paragraph.getChildren().some($isMarkdownBoldNode)).toBe(true);
			expect(paragraph.getChildren().some($isLinkNode)).toBe(true);
			const selection = $getSelection();
			expect($isRangeSelection(selection)).toBe(true);
			if (!$isRangeSelection(selection)) return;
			expect(selection.anchor.type).toBe("text");
			expect(selection.anchor.getNode().getTextContent()).toBe("b");
			expect(selection.anchor.offset).toBe(1);
		});
	});

	it("moves a closing-marker caret after its owner before inserting text", () => {
		const editor = createReconcileEditor();
		appendRawParagraph(editor, "**x*");
		editor.update(
			() => {
				const paragraph = $getRoot().getFirstChild();
				const selection = $getSelection();
				if (!$isParagraphNode(paragraph) || !$isRangeSelection(selection)) return;
				const text = paragraph.getFirstChild();
				if (!$isTextNode(text)) return;
				selection.setTextNodeRange(text, 4, text, 4);
				selection.insertText("*");
				$reconcileMarkdownParagraph(paragraph);
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			const selection = $getSelection();
			expect($isElementNode(paragraph)).toBe(true);
			expect($isRangeSelection(selection)).toBe(true);
			if (!$isElementNode(paragraph) || !$isRangeSelection(selection)) return;
			expect(selection.anchor.type).toBe("element");
			expect(selection.anchor.key).toBe(paragraph.getKey());
			expect(selection.anchor.offset).toBe(1);
			const owner = paragraph.getFirstChild();
			expect($isMarkdownBoldNode(owner)).toBe(true);
			if (!$isMarkdownBoldNode(owner)) return;
			expect(owner.getLastChild()?.getTextContent()).toBe("**");
		});

		editor.update(
			() => {
				const selection = $getSelection();
				if (!$isRangeSelection(selection)) return;
				selection.insertText(" next");
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			expect($isElementNode(paragraph)).toBe(true);
			if (!$isElementNode(paragraph)) return;
			expect(paragraph.getTextContent()).toBe("**x** next");
			const owner = paragraph.getFirstChild();
			expect($isMarkdownBoldNode(owner)).toBe(true);
			if (!$isMarkdownBoldNode(owner)) return;
			expect(owner.getLastChild()?.getTextContent()).toBe("**");
			const inserted = paragraph.getChildAtIndex(1);
			expect($isTextNode(inserted)).toBe(true);
			expect($isMarkdownInlineMarkerNode(inserted)).toBe(false);
		});
	});

	it("moves a collapsed structured-link end caret after the link", () => {
		const editor = createReconcileEditor();
		appendRawParagraph(editor, "[label](url)");
		editor.update(
			() => {
				const paragraph = $getRoot().getFirstChild();
				const selection = $getSelection();
				if (!$isParagraphNode(paragraph) || !$isRangeSelection(selection)) return;
				const text = paragraph.getFirstChild();
				if (!$isTextNode(text)) return;
				selection.setTextNodeRange(text, 12, text, 12);
				$reconcileMarkdownParagraph(paragraph);
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			const selection = $getSelection();
			expect($isElementNode(paragraph)).toBe(true);
			expect($isRangeSelection(selection)).toBe(true);
			if (!$isElementNode(paragraph) || !$isRangeSelection(selection)) return;
			expect(selection.anchor.type).toBe("element");
			expect(selection.anchor.key).toBe(paragraph.getKey());
			expect(selection.anchor.offset).toBe(1);
			expect($isLinkNode(paragraph.getFirstChild())).toBe(true);
		});
	});

	it("preserves backward ranges and avoids work for an unchanged source", () => {
		const source = "abc **x** def";
		const editor = createReconcileEditor();
		appendRawParagraph(editor, source);
		let firstChildren: string[] = [];
		editor.update(
			() => {
				const paragraph = $getRoot().getFirstChild();
				const selection = $getSelection();
				if (!$isParagraphNode(paragraph) || !$isRangeSelection(selection)) return;
				const text = paragraph.getFirstChild();
				if (!$isTextNode(text)) return;
				selection.setTextNodeRange(text, 11, text, 4);
				$reconcileMarkdownParagraph(paragraph);
				firstChildren = paragraph.getChildren().map((child) => child.getKey());
			},
			{ discrete: true },
		);

		let changed = true;
		editor.update(
			() => {
				const paragraph = $getRoot().getFirstChild();
				if (!$isParagraphNode(paragraph)) return;
				changed = $reconcileMarkdownParagraph(paragraph);
				expect(paragraph.getChildren().map((child) => child.getKey())).toEqual(firstChildren);
			},
			{ discrete: true },
		);
		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			const selection = $getSelection();
			expect(changed).toBe(false);
			expect($isElementNode(paragraph)).toBe(true);
			expect($isRangeSelection(selection)).toBe(true);
			if (!$isElementNode(paragraph) || !$isRangeSelection(selection)) return;
			const snapshot = $getMarkdownBlockSelectionSnapshot(selection);
			expect(snapshot?.anchorOffset).toBe(11);
			expect(snapshot?.focusOffset).toBe(4);
			expect(snapshot?.isBackward).toBe(true);
		});
	});

	it("leaves a paragraph with multiple markdown blocks unchanged", () => {
		const editor = createReconcileEditor();
		appendRawParagraph(editor, "first\n\nsecond");
		let before = "";
		let changed = true;
		editor.update(
			() => {
				const paragraph = $getRoot().getFirstChild();
				if (!$isParagraphNode(paragraph)) return;
				before = paragraph.getFirstChild()?.getKey() ?? "";
				changed = $reconcileMarkdownParagraph(paragraph);
				expect(paragraph.getFirstChild()?.getKey()).toBe(before);
			},
			{ discrete: true },
		);
		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			expect(changed).toBe(false);
			expect($isElementNode(paragraph)).toBe(true);
			if (!$isElementNode(paragraph)) return;
			expect(paragraph.getTextContent()).toBe("first\n\nsecond");
		});
	});

	it("preserves trailing spaces and restores a caret after them", () => {
		const source = "before **bold**   ";
		const editor = createReconcileEditor();
		appendRawParagraph(editor, source);
		editor.update(
			() => {
				const paragraph = $getRoot().getFirstChild();
				const selection = $getSelection();
				if (!$isParagraphNode(paragraph) || !$isRangeSelection(selection)) return;
				const text = paragraph.getFirstChild();
				if (!$isTextNode(text)) return;
				selection.setTextNodeRange(text, source.length, text, source.length);
				$reconcileMarkdownParagraph(paragraph);
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			const selection = $getSelection();
			expect($isParagraphNode(paragraph)).toBe(true);
			expect($isRangeSelection(selection)).toBe(true);
			if (!$isParagraphNode(paragraph) || !$isRangeSelection(selection)) return;
			expect(paragraph.getTextContent()).toBe(source);
			expect($getMarkdownBlockSelectionSnapshot(selection)?.anchorOffset).toBe(source.length);
			expect($getMarkdownBlockSelectionSnapshot(selection)?.focusOffset).toBe(source.length);
		});
	});
});
