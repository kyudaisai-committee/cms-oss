import { $isLinkNode, LinkNode } from "@lexical/link";
import { $convertToMarkdownString } from "@lexical/markdown";
import { $isHeadingNode, HeadingNode } from "@lexical/rich-text";
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
	$reconcileMarkdownHeading,
	registerMarkdownHeadingReconciler,
} from "#editor/heading/reconcile";
import {
	$isMarkdownBoldNode,
	$isMarkdownInlineCodeNode,
	$isMarkdownItalicNode,
	$isMarkdownStrikethroughNode,
	MarkdownBoldNode,
	MarkdownInlineCodeNode,
	MarkdownItalicNode,
	MarkdownStrikethroughNode,
} from "#editor/inline/nodes";
import { $getMarkdownBlockSelectionSnapshot } from "#editor/shared/block-source";
import { MarkdownInlineMarkerNode } from "#editor/shared/marker-node";
import { MARKDOWN_EDITOR_TRANSFORMERS } from "#editor/shared/transformers";

function createHeadingEditor() {
	const editor = createEditor({
		namespace: "MarkdownHeadingReconcileTest",
		nodes: [
			HeadingNode,
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
	registerMarkdownHeadingReconciler(editor);
	return editor;
}

function appendRawParagraph(editor: ReturnType<typeof createHeadingEditor>, source: string) {
	editor.update(
		() => {
			const paragraph = $createParagraphNode();
			const text = $createTextNode(source);
			paragraph.append(text);
			$getRoot().append(paragraph);
			const selection = $createRangeSelection();
			selection.setTextNodeRange(text, 0, text, 0);
			$setSelection(selection);
		},
		{ discrete: true },
	);
}

function getSelectionOffsets(editor: ReturnType<typeof createHeadingEditor>) {
	return editor.getEditorState().read(() => {
		const selection = $getSelection();
		if (!$isRangeSelection(selection)) return null;
		const snapshot = $getMarkdownBlockSelectionSnapshot(selection);
		if (!snapshot) return null;
		return {
			anchorOffset: snapshot.anchorOffset,
			focusOffset: snapshot.focusOffset,
			isBackward: snapshot.isBackward,
		};
	});
}

describe("markdown heading reconcile", () => {
	it("keeps an incomplete heading marker as a paragraph until whitespace is typed", () => {
		for (const source of ["#", "##", "######"]) {
			const editor = createHeadingEditor();
			appendRawParagraph(editor, source);

			editor.getEditorState().read(() => {
				const paragraph = $getRoot().getFirstChild();
				expect($isParagraphNode(paragraph)).toBe(true);
				expect(paragraph?.getTextContent()).toBe(source);
			});
		}
	});

	it("converts a typed heading paragraph into a standard HeadingNode", () => {
		const editor = createHeadingEditor();
		appendRawParagraph(editor, "## heading");

		editor.getEditorState().read(() => {
			const heading = $getRoot().getFirstChild();
			expect($isHeadingNode(heading)).toBe(true);
			if (!$isHeadingNode(heading)) return;
			expect(heading.getTag()).toBe("h2");
			expect(heading.getFirstChild()?.getTextContent()).toBe("## ");
			expect(heading.getTextContent()).toBe("## heading");
		});
	});

	it("reconciles heading marker and body edits through raw parsing", () => {
		const editor = createHeadingEditor();
		appendRawParagraph(editor, "## heading");

		editor.update(
			() => {
				const heading = $getRoot().getFirstChild();
				if (!$isHeadingNode(heading)) return;
				const marker = heading.getFirstChild();
				const body = heading.getChildAtIndex(1);
				if ($isTextNode(marker)) marker.setTextContent("### ");
				if ($isTextNode(body)) body.setTextContent("changed  ");
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const heading = $getRoot().getFirstChild();
			expect($isHeadingNode(heading)).toBe(true);
			if (!$isHeadingNode(heading)) return;
			expect(heading.getTag()).toBe("h3");
			expect(heading.getTextContent()).toBe("### changed  ");
		});
	});

	it("updates heading levels through marker insertion and deletion", () => {
		const editor = createHeadingEditor();
		appendRawParagraph(editor, "## heading");

		editor.update(
			() => {
				const heading = $getRoot().getFirstChild();
				if (!$isHeadingNode(heading)) return;
				const marker = heading.getFirstChild();
				if (!$isTextNode(marker)) return;
				const selection = $createRangeSelection();
				selection.setTextNodeRange(marker, 2, marker, 2);
				$setSelection(selection);
				selection.insertText("#");
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const heading = $getRoot().getFirstChild();
			expect($isHeadingNode(heading)).toBe(true);
			if (!$isHeadingNode(heading)) return;
			expect(heading.getTag()).toBe("h3");
			expect(heading.getFirstChild()?.getTextContent()).toBe("### ");
		});

		editor.update(
			() => {
				const heading = $getRoot().getFirstChild();
				if (!$isHeadingNode(heading)) return;
				const marker = heading.getFirstChild();
				if (!$isTextNode(marker)) return;
				const selection = $createRangeSelection();
				selection.setTextNodeRange(marker, 2, marker, 3);
				$setSelection(selection);
				selection.removeText();
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const heading = $getRoot().getFirstChild();
			expect($isHeadingNode(heading)).toBe(true);
			if (!$isHeadingNode(heading)) return;
			expect(heading.getTag()).toBe("h2");
			expect(heading.getFirstChild()?.getTextContent()).toBe("## ");
			expect($isRangeSelection($getSelection())).toBe(true);
		});
	});

	it("demotes h2 to a paragraph when one marker is deleted", () => {
		const editor = createHeadingEditor();
		appendRawParagraph(editor, "## heading");

		editor.update(
			() => {
				const heading = $getRoot().getFirstChild();
				if (!$isHeadingNode(heading)) return;
				const marker = heading.getFirstChild();
				if (!$isTextNode(marker)) return;
				const selection = $createRangeSelection();
				selection.setTextNodeRange(marker, 1, marker, 2);
				$setSelection(selection);
				selection.removeText();
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			expect($isParagraphNode(paragraph)).toBe(true);
			if (!$isParagraphNode(paragraph)) return;
			expect(paragraph.getTextContent()).toBe("# heading");
		});
		expect(getSelectionOffsets(editor)).toMatchObject({ anchorOffset: 1, focusOffset: 1 });

		editor.update(
			() => {
				const paragraph = $getRoot().getFirstChild();
				if (!$isParagraphNode(paragraph)) return;
				const text = paragraph.getFirstChild();
				if (!$isTextNode(text)) return;
				const selection = $createRangeSelection();
				selection.setTextNodeRange(text, 0, text, 1);
				$setSelection(selection);
				selection.removeText();
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			expect($isParagraphNode(paragraph)).toBe(true);
			expect(paragraph?.getTextContent()).toBe(" heading");
		});
	});

	it.each([
		{ name: "first marker", anchor: 1, focus: 2, source: "# heading", offset: 1 },
		{ name: "second marker", anchor: 2, focus: 3, source: "##heading", offset: 2 },
		{ name: "all markers", anchor: 0, focus: 3, source: "heading", offset: 0 },
		{ name: "backward marker range", anchor: 2, focus: 1, source: "# heading", offset: 1 },
	])("keeps the caret after deleting the $name", ({ anchor, focus, source, offset }) => {
		const editor = createHeadingEditor();
		appendRawParagraph(editor, "## heading");

		editor.update(
			() => {
				const heading = $getRoot().getFirstChild();
				if (!$isHeadingNode(heading)) return;
				const marker = heading.getFirstChild();
				if (!$isTextNode(marker)) return;
				const selection = $createRangeSelection();
				selection.setTextNodeRange(marker, anchor, marker, focus);
				$setSelection(selection);
				selection.removeText();
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			expect($isParagraphNode(paragraph)).toBe(true);
			expect(paragraph?.getTextContent()).toBe(source);
		});
		expect(getSelectionOffsets(editor)).toMatchObject({
			anchorOffset: offset,
			focusOffset: offset,
		});

		editor.update(
			() => {
				const selection = $getSelection();
				if ($isRangeSelection(selection)) selection.insertText("x");
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			expect($isParagraphNode(paragraph)).toBe(true);
			expect(paragraph?.getTextContent()).toBe(
				source.slice(0, offset) + "x" + source.slice(offset),
			);
		});
		expect(getSelectionOffsets(editor)).toMatchObject({
			anchorOffset: offset + 1,
			focusOffset: offset + 1,
		});
	});

	it("keeps the caret at the marker and body boundary when deletion crosses into body text", () => {
		const editor = createHeadingEditor();
		appendRawParagraph(editor, "## あいうえお");

		editor.update(
			() => {
				const heading = $getRoot().getFirstChild();
				if (!$isHeadingNode(heading)) return;
				const marker = heading.getFirstChild();
				const body = heading.getChildAtIndex(1);
				if (!$isTextNode(marker) || !$isTextNode(body)) return;
				const selection = $createRangeSelection();
				selection.setTextNodeRange(marker, 2, body, 2);
				$setSelection(selection);
				selection.removeText();
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			expect($isParagraphNode(paragraph)).toBe(true);
			expect(paragraph?.getTextContent()).toBe("##うえお");
		});
		expect(getSelectionOffsets(editor)).toMatchObject({ anchorOffset: 2, focusOffset: 2 });
	});

	it("keeps an empty h2 editable after its full marker is deleted", () => {
		const editor = createHeadingEditor();
		appendRawParagraph(editor, "## ");

		editor.update(
			() => {
				const heading = $getRoot().getFirstChild();
				if (!$isHeadingNode(heading)) return;
				const marker = heading.getFirstChild();
				if (!$isTextNode(marker)) return;
				const selection = $createRangeSelection();
				selection.setTextNodeRange(marker, 0, marker, marker.getTextContentSize());
				$setSelection(selection);
				selection.removeText();
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			expect($isParagraphNode(paragraph)).toBe(true);
			expect(paragraph?.getTextContent()).toBe("");
		});
		expect(getSelectionOffsets(editor)).toMatchObject({ anchorOffset: 0, focusOffset: 0 });

		editor.update(
			() => {
				const selection = $getSelection();
				if ($isRangeSelection(selection)) selection.insertText("typed");
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			expect($isParagraphNode(paragraph)).toBe(true);
			expect(paragraph?.getTextContent()).toBe("typed");
		});
	});

	it("demotes to ParagraphNode when the heading marker is removed", () => {
		const editor = createHeadingEditor();
		appendRawParagraph(editor, "## **body**");

		editor.update(
			() => {
				const heading = $getRoot().getFirstChild();
				if ($isHeadingNode(heading)) heading.getFirstChild()?.remove();
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			expect($isParagraphNode(paragraph)).toBe(true);
			if (!$isParagraphNode(paragraph)) return;
			expect(paragraph.getTextContent()).toBe("**body**");
			expect($isMarkdownBoldNode(paragraph.getFirstChild())).toBe(true);
		});
	});

	it("preserves nested inline and link trivia in an h2", () => {
		const source = "## **bold** *italic* ~~strike~~ `code` [label](url)   ";
		const editor = createHeadingEditor();
		appendRawParagraph(editor, source);

		editor.getEditorState().read(() => {
			const heading = $getRoot().getFirstChild();
			expect($isHeadingNode(heading)).toBe(true);
			if (!$isHeadingNode(heading)) return;
			expect(heading.getTag()).toBe("h2");
			expect(heading.getTextContent()).toBe(
				"## **bold** *italic* ~~strike~~ `code` [label](url)   ",
			);
			expect($isMarkdownBoldNode(heading.getChildren()[1])).toBe(true);
			expect(heading.getChildren().some($isMarkdownItalicNode)).toBe(true);
			expect(heading.getChildren().some($isMarkdownStrikethroughNode)).toBe(true);
			expect(heading.getChildren().some($isMarkdownInlineCodeNode)).toBe(true);
			expect(heading.getChildren().some($isLinkNode)).toBe(true);
			expect($convertToMarkdownString(MARKDOWN_EDITOR_TRANSFORMERS)).toBe(
				"## **bold** *italic* ~~strike~~ `code` [label](url)   ",
			);
		});
	});

	it("keeps h1 syntax as paragraph text", () => {
		const editor = createHeadingEditor();
		appendRawParagraph(editor, "# heading");

		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			expect($isParagraphNode(paragraph)).toBe(true);
			expect(paragraph?.getTextContent()).toBe("# heading");
		});
	});

	it("restores raw selection offsets and leaves the tree unchanged on selection-only updates", () => {
		const source = "## heading   ";
		const editor = createHeadingEditor();
		appendRawParagraph(editor, source);

		editor.update(
			() => {
				const heading = $getRoot().getFirstChild();
				if (!$isHeadingNode(heading)) return;
				$reconcileMarkdownHeading(heading);
			},
			{ discrete: true },
		);

		const before = editor.getEditorState().toJSON().root;
		editor.update(
			() => {
				const heading = $getRoot().getFirstChild();
				if (!$isHeadingNode(heading)) return;
				const body = heading.getChildAtIndex(1);
				if (!$isTextNode(body)) return;
				const selection = $createRangeSelection();
				selection.setTextNodeRange(
					body,
					body.getTextContentSize(),
					body,
					body.getTextContentSize(),
				);
				$setSelection(selection);
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const selection = $getSelection();
			expect($isRangeSelection(selection)).toBe(true);
			if (!$isRangeSelection(selection)) return;
			expect($getMarkdownBlockSelectionSnapshot(selection)?.anchorOffset).toBe(source.length);
		});
		expect(editor.getEditorState().toJSON().root).toEqual(before);
	});
});
