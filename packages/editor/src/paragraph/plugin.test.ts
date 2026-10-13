import { $createLinkNode, $isLinkNode, LinkNode } from "@lexical/link";
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
import { $getStructuredLinkRole, $isStructuredLink } from "#editor/link/model";
import { registerMarkdownParagraphReconciler } from "#editor/paragraph/plugin";
import {
	$getMarkdownBlockRawSource,
	$getMarkdownBlockSelectionSnapshot,
} from "#editor/shared/block-source";
import { MarkdownInlineMarkerNode } from "#editor/shared/marker-node";

function createReconcilerEditor() {
	return createEditor({
		namespace: "MarkdownParagraphReconcilePluginTest",
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

function appendRawParagraph(editor: ReturnType<typeof createReconcilerEditor>, source: string) {
	editor.update(
		() => {
			const paragraph = $createParagraphNode();
			paragraph.append($createTextNode(source));
			$getRoot().append(paragraph);
		},
		{ discrete: true },
	);
}

function dirtyParagraph(editor: ReturnType<typeof createReconcilerEditor>) {
	editor.update(
		() => {
			const paragraph = $getRoot().getFirstChild();
			if (!$isParagraphNode(paragraph)) return;
			const empty = $createTextNode("");
			paragraph.append(empty);
			empty.remove();
		},
		{ discrete: true },
	);
}

describe("registerMarkdownParagraphReconciler", () => {
	it.each([
		{ role: "url" as const, expected: "[label]()" },
		{ role: "label" as const, expected: "[](https://example.test)" },
	])("keeps a completed link source editable after deleting its $role", ({ role, expected }) => {
		const editor = createReconcilerEditor();
		const removeReconciler = registerMarkdownParagraphReconciler(editor);
		appendRawParagraph(editor, "[label](https://example.test)");

		editor.update(
			() => {
				const paragraph = $getRoot().getFirstChild();
				if (!$isParagraphNode(paragraph)) return;
				const link = paragraph.getChildren().find($isLinkNode);
				if (!$isLinkNode(link)) return;
				const target = link.getChildren().find((child) => $getStructuredLinkRole(child) === role);
				if (!$isTextNode(target)) return;
				const selection = $createRangeSelection();
				selection.setTextNodeRange(target, 0, target, target.getTextContentSize());
				$setSelection(selection);
				selection.removeText();
				target.remove();
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			expect($isParagraphNode(paragraph)).toBe(true);
			if (!$isParagraphNode(paragraph)) return;
			expect($getMarkdownBlockRawSource(paragraph)).toBe(expected);
			expect(paragraph.getTextContent()).toBe(expected);
			expect(paragraph.getChildren().some($isStructuredLink)).toBe(false);
		});

		removeReconciler();
	});

	it("preserves HTML link labels and URLs when reconciling clipboard content", () => {
		const editor = createReconcilerEditor();
		const removeReconciler = registerMarkdownParagraphReconciler(editor);
		editor.update(
			() => {
				const paragraph = $createParagraphNode();
				const before = $createTextNode("before ");
				const label = $createTextNode("example");
				const link = $createLinkNode("https://example.test");
				link.append(label);
				const after = $createTextNode(" after");
				paragraph.append(before, link, after);
				$getRoot().append(paragraph);
				const selection = $createRangeSelection();
				selection.setTextNodeRange(label, 1, label, 3);
				$setSelection(selection);
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			const selection = $getSelection();
			expect($isParagraphNode(paragraph)).toBe(true);
			expect($isRangeSelection(selection)).toBe(true);
			if (!$isParagraphNode(paragraph) || !$isRangeSelection(selection)) return;
			expect($getMarkdownBlockRawSource(paragraph)).toBe(
				"before [example](https://example.test) after",
			);
			const link = paragraph.getChildren().find($isLinkNode);
			expect($isLinkNode(link)).toBe(true);
			if (!$isLinkNode(link)) return;
			expect($isStructuredLink(link)).toBe(true);
			expect(link.getURL()).toBe("https://example.test");
			const snapshot = $getMarkdownBlockSelectionSnapshot(selection);
			expect(snapshot?.anchorOffset).toBe(9);
			expect(snapshot?.focusOffset).toBe(11);
		});

		removeReconciler();
	});

	it("canonicalizes a closing delimiter and keeps later input outside the owner", () => {
		const editor = createReconcilerEditor();
		appendRawParagraph(editor, "**x*");
		editor.update(
			() => {
				const paragraph = $getRoot().getFirstChild();
				if (!$isParagraphNode(paragraph)) return;
				const text = paragraph.getFirstChild();
				if (!$isTextNode(text)) return;
				const selection = $createRangeSelection();
				selection.setTextNodeRange(text, 4, text, 4);
				$setSelection(selection);
			},
			{ discrete: true },
		);
		const removeReconciler = registerMarkdownParagraphReconciler(editor);
		editor.update(
			() => {
				const selection = $getSelection();
				if (!$isRangeSelection(selection)) return;
				selection.insertText("*");
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			const selection = $getSelection();
			expect($isParagraphNode(paragraph)).toBe(true);
			expect($isRangeSelection(selection)).toBe(true);
			if (!$isParagraphNode(paragraph) || !$isRangeSelection(selection)) return;
			expect($isMarkdownBoldNode(paragraph.getFirstChild())).toBe(true);
			expect(selection.anchor.type).toBe("element");
			expect(selection.anchor.key).toBe(paragraph.getKey());
			expect(selection.anchor.offset).toBe(1);
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
			expect($isTextNode(paragraph.getChildAtIndex(1))).toBe(true);
		});
		removeReconciler();
	});

	it("rebuilds canonical nested content when an existing body changes", () => {
		const editor = createReconcilerEditor();
		appendRawParagraph(editor, "**x**");
		const removeReconciler = registerMarkdownParagraphReconciler(editor);
		dirtyParagraph(editor);

		editor.update(
			() => {
				const paragraph = $getRoot().getFirstChild();
				if (!$isParagraphNode(paragraph)) return;
				const owner = paragraph.getFirstChild();
				if (!$isMarkdownBoldNode(owner)) return;
				const body = owner.getChildAtIndex(1);
				if ($isTextNode(body)) body.setTextContent("y");
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			expect($isParagraphNode(paragraph)).toBe(true);
			if (!$isParagraphNode(paragraph)) return;
			expect(paragraph.getTextContent()).toBe("**y**");
			const owner = paragraph.getFirstChild();
			expect($isMarkdownBoldNode(owner)).toBe(true);
			if (!$isMarkdownBoldNode(owner)) return;
			expect(owner.getChildAtIndex(1)?.getTextContent()).toBe("y");
		});
		removeReconciler();
	});

	it("does not change the node tree for a selection-only update", () => {
		const editor = createReconcilerEditor();
		appendRawParagraph(editor, "**x**");
		const removeReconciler = registerMarkdownParagraphReconciler(editor);
		dirtyParagraph(editor);
		const before = editor.getEditorState().toJSON().root;

		editor.update(
			() => {
				const paragraph = $getRoot().getFirstChild();
				if (!$isParagraphNode(paragraph)) return;
				const owner = paragraph.getFirstChild();
				if (!$isMarkdownBoldNode(owner)) return;
				const body = owner.getChildAtIndex(1);
				if (!$isTextNode(body)) return;
				const selection = $createRangeSelection();
				selection.setTextNodeRange(body, 0, body, 1);
				$setSelection(selection);
			},
			{ discrete: true },
		);

		expect(editor.getEditorState().toJSON().root).toEqual(before);
		removeReconciler();
	});

	it("reconciles structural marker removal and stops after cleanup", () => {
		const editor = createReconcilerEditor();
		appendRawParagraph(editor, "**x**");
		const removeReconciler = registerMarkdownParagraphReconciler(editor);
		dirtyParagraph(editor);

		editor.update(
			() => {
				const paragraph = $getRoot().getFirstChild();
				if (!$isParagraphNode(paragraph)) return;
				const owner = paragraph.getFirstChild();
				if (!$isMarkdownBoldNode(owner)) return;
				owner.getFirstChild()?.remove();
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			expect($isParagraphNode(paragraph)).toBe(true);
			if (!$isParagraphNode(paragraph)) return;
			expect(paragraph.getTextContent()).toBe("x**");
			expect($isMarkdownBoldNode(paragraph.getFirstChild())).toBe(false);
		});

		removeReconciler();
		editor.update(
			() => {
				const paragraph = $getRoot().getFirstChild();
				if (!$isParagraphNode(paragraph)) return;
				const text = paragraph.getFirstChild();
				if ($isTextNode(text)) text.setTextContent("**z*");
			},
			{ discrete: true },
		);
		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			expect($isParagraphNode(paragraph)).toBe(true);
			if (!$isParagraphNode(paragraph)) return;
			expect(paragraph.getTextContent()).toBe("**z*");
			expect($isMarkdownBoldNode(paragraph.getFirstChild())).toBe(false);
		});
	});
});
