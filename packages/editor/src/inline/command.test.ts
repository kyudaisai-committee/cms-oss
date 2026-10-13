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

import { toggleMarkdownInlineFormat } from "#editor/inline/command";
import {
	$createMarkdownBoldNode,
	$createMarkdownItalicNode,
	$isMarkdownBoldNode,
	$isMarkdownInlineCodeNode,
	$isMarkdownItalicNode,
	MarkdownBoldNode,
	MarkdownInlineCodeNode,
	MarkdownItalicNode,
	MarkdownStrikethroughNode,
	type MarkdownInlineFormat,
} from "#editor/inline/nodes";
import { $reconcileMarkdownParagraph } from "#editor/paragraph/reconcile";
import { $getMarkdownBlockSelectionSnapshot } from "#editor/shared/block-source";
import { MarkdownInlineMarkerNode } from "#editor/shared/marker-node";

const FORMAT_CASES = [
	{ format: "bold", ownerType: "markdown-bold", delimiter: "**" },
	{ format: "italic", ownerType: "markdown-italic", delimiter: "*" },
	{ format: "strikethrough", ownerType: "markdown-strikethrough", delimiter: "~~" },
	{ format: "code", ownerType: "markdown-inline-code", delimiter: "`" },
] satisfies ReadonlyArray<{
	format: MarkdownInlineFormat;
	ownerType: string;
	delimiter: string;
}>;

function createFormatEditor() {
	return createEditor({
		namespace: "MarkdownInlineFormatCommandTest",
		nodes: [
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

function appendTextParagraph(editor: ReturnType<typeof createFormatEditor>, source: string) {
	editor.update(
		() => {
			const paragraph = $createParagraphNode();
			paragraph.append($createTextNode(source));
			$getRoot().append(paragraph);
		},
		{ discrete: true },
	);
}

function setTextSelection(
	editor: ReturnType<typeof createFormatEditor>,
	start: number,
	end: number,
) {
	editor.update(
		() => {
			const paragraph = $getRoot().getFirstChild();
			if (!$isParagraphNode(paragraph)) return;
			const text = paragraph.getFirstChild();
			if (!$isTextNode(text)) return;
			const selection = $createRangeSelection();
			selection.setTextNodeRange(text, start, text, end);
			$setSelection(selection);
		},
		{ discrete: true },
	);
}

describe("toggleMarkdownInlineFormat", () => {
	it("wraps a selected raw slice with each inline delimiter", () => {
		for (const testCase of FORMAT_CASES) {
			const editor = createFormatEditor();
			appendTextParagraph(editor, "sample");
			setTextSelection(editor, 0, 6);
			editor.getEditorState().read(() => {
				const selection = $getSelection();
				expect($isRangeSelection(selection)).toBe(true);
				if ($isRangeSelection(selection)) expect(selection.getTextContent()).toBe("sample");
			});
			toggleMarkdownInlineFormat(editor, testCase.format);

			editor.getEditorState().read(() => {
				const paragraph = $getRoot().getFirstChild();
				expect($isParagraphNode(paragraph)).toBe(true);
				if (!$isParagraphNode(paragraph)) return;
				expect(paragraph.getTextContent()).toBe(`${testCase.delimiter}sample${testCase.delimiter}`);
				expect(paragraph.getFirstChild()?.getType()).toBe(testCase.ownerType);
			});
		}
	});

	it("inserts a collapsed pair, then canonicalizes after typing", () => {
		const editor = createFormatEditor();
		appendTextParagraph(editor, "hello");
		setTextSelection(editor, 2, 2);
		toggleMarkdownInlineFormat(editor, "bold");

		editor.update(
			() => {
				const paragraph = $getRoot().getFirstChild();
				const selection = $getSelection();
				if (!$isParagraphNode(paragraph) || !$isRangeSelection(selection)) return;
				selection.insertText("x");
				$reconcileMarkdownParagraph(paragraph);
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			expect($isParagraphNode(paragraph)).toBe(true);
			if (!$isParagraphNode(paragraph)) return;
			expect(paragraph.getTextContent()).toBe("he**x**llo");
			expect(paragraph.getChildren().some($isMarkdownBoldNode)).toBe(true);
		});
	});

	it("toggles off the matching owner while preserving content selection", () => {
		const editor = createFormatEditor();
		editor.update(
			() => {
				const paragraph = $createParagraphNode();
				paragraph.append($createMarkdownBoldNode([$createTextNode("hello")]));
				$getRoot().append(paragraph);
			},
			{ discrete: true },
		);
		editor.update(
			() => {
				const paragraph = $getRoot().getFirstChild();
				if (!$isParagraphNode(paragraph)) return;
				const owner = paragraph.getFirstChild();
				if (!$isMarkdownBoldNode(owner)) return;
				const body = owner.getChildAtIndex(1);
				if (!$isTextNode(body)) return;
				const selection = $createRangeSelection();
				selection.setTextNodeRange(body, 1, body, 4);
				$setSelection(selection);
			},
			{ discrete: true },
		);
		toggleMarkdownInlineFormat(editor, "bold");

		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			const selection = $getSelection();
			expect($isParagraphNode(paragraph)).toBe(true);
			expect($isRangeSelection(selection)).toBe(true);
			if (!$isParagraphNode(paragraph) || !$isRangeSelection(selection)) return;
			expect(paragraph.getTextContent()).toBe("hello");
			expect($isMarkdownBoldNode(paragraph.getFirstChild())).toBe(false);
			expect(selection.anchor.offset).toBe(1);
			expect(selection.focus.offset).toBe(4);
		});
	});

	it("turns off only the nested matching owner", () => {
		const editor = createFormatEditor();
		editor.update(
			() => {
				const paragraph = $createParagraphNode();
				paragraph.append(
					$createMarkdownBoldNode([
						$createTextNode("a "),
						$createMarkdownItalicNode([$createTextNode("b")]),
						$createTextNode(" c"),
					]),
				);
				$getRoot().append(paragraph);
			},
			{ discrete: true },
		);
		editor.update(
			() => {
				const paragraph = $getRoot().getFirstChild();
				if (!$isElementNode(paragraph)) return;
				const bold = paragraph.getFirstChild();
				if (!$isMarkdownBoldNode(bold)) return;
				const italic = bold.getChildAtIndex(2);
				if (!$isMarkdownItalicNode(italic)) return;
				const body = italic.getChildAtIndex(1);
				if (!$isTextNode(body)) return;
				const selection = $createRangeSelection();
				selection.setTextNodeRange(body, 0, body, 1);
				$setSelection(selection);
			},
			{ discrete: true },
		);
		toggleMarkdownInlineFormat(editor, "italic");

		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			expect($isParagraphNode(paragraph)).toBe(true);
			if (!$isParagraphNode(paragraph)) return;
			expect(paragraph.getTextContent()).toBe("**a b c**");
			expect($isMarkdownBoldNode(paragraph.getFirstChild())).toBe(true);
			expect(paragraph.getChildren().some($isMarkdownItalicNode)).toBe(false);
		});
	});

	it("chooses a longer code fence when the selected source contains backticks", () => {
		const editor = createFormatEditor();
		appendTextParagraph(editor, "a`b");
		setTextSelection(editor, 0, 3);
		toggleMarkdownInlineFormat(editor, "code");

		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			expect($isParagraphNode(paragraph)).toBe(true);
			if (!$isParagraphNode(paragraph)) return;
			expect(paragraph.getTextContent()).toBe("`` a`b ``");
			const owner = paragraph.getFirstChild();
			expect($isMarkdownInlineCodeNode(owner)).toBe(true);
			if (!$isMarkdownInlineCodeNode(owner)) return;
			expect(owner.getFirstChild()?.getTextContent()).toBe("``");
		});
	});

	it("preserves backward selection direction while wrapping", () => {
		const editor = createFormatEditor();
		appendTextParagraph(editor, "hello");
		editor.update(
			() => {
				const paragraph = $getRoot().getFirstChild();
				if (!$isParagraphNode(paragraph)) return;
				const text = paragraph.getFirstChild();
				if (!$isTextNode(text)) return;
				const selection = $createRangeSelection();
				selection.setTextNodeRange(text, 4, text, 1);
				$setSelection(selection);
			},
			{ discrete: true },
		);
		toggleMarkdownInlineFormat(editor, "italic");

		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			const selection = $getSelection();
			expect($isParagraphNode(paragraph)).toBe(true);
			expect($isRangeSelection(selection)).toBe(true);
			if (!$isParagraphNode(paragraph) || !$isRangeSelection(selection)) return;
			expect(paragraph.getTextContent()).toBe("h*ell*o");
			const snapshot = $getMarkdownBlockSelectionSnapshot(selection);
			expect(snapshot?.anchorOffset).toBe(5);
			expect(snapshot?.focusOffset).toBe(2);
			expect(snapshot?.isBackward).toBe(true);
		});
	});

	it("does nothing when the selection crosses blocks", () => {
		const editor = createFormatEditor();
		let firstKey = "";
		let secondKey = "";
		editor.update(
			() => {
				const first = $createParagraphNode();
				const second = $createParagraphNode();
				const firstText = $createTextNode("first");
				const secondText = $createTextNode("second");
				firstKey = firstText.getKey();
				secondKey = secondText.getKey();
				first.append(firstText);
				second.append(secondText);
				$getRoot().append(first, second);
				const selection = $createRangeSelection();
				selection.setTextNodeRange(firstText, 1, secondText, 2);
				$setSelection(selection);
			},
			{ discrete: true },
		);
		const before = editor.getEditorState().toJSON().root;
		toggleMarkdownInlineFormat(editor, "bold");

		editor.getEditorState().read(() => {
			const first = $getRoot().getFirstChild();
			const second = $getRoot().getLastChild();
			expect($isParagraphNode(first)).toBe(true);
			expect($isParagraphNode(second)).toBe(true);
			if (!$isParagraphNode(first) || !$isParagraphNode(second)) return;
			expect(first.getFirstChild()?.getKey()).toBe(firstKey);
			expect(second.getFirstChild()?.getKey()).toBe(secondKey);
		});
		expect(editor.getEditorState().toJSON().root).toEqual(before);
	});
});
