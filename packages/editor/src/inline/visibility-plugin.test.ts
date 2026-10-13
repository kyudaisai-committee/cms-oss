import {
	$createParagraphNode,
	$createRangeSelection,
	$createTextNode,
	$getRoot,
	$isElementNode,
	$isTextNode,
	$setSelection,
	createEditor,
} from "lexical";
import { describe, expect, it } from "vitest";

import {
	$createMarkdownBoldNode,
	$createMarkdownInlineCodeNode,
	$createMarkdownItalicNode,
	$createMarkdownStrikethroughNode,
	$isMarkdownInlineCodeNode,
	MarkdownBoldNode,
	MarkdownInlineCodeNode,
	MarkdownItalicNode,
	MarkdownStrikethroughNode,
} from "#editor/inline/nodes";
import { $classifyMarkdownInlineMarkerVisibility } from "#editor/inline/visibility-plugin";
import { $isMarkdownInlineMarkerNode, MarkdownInlineMarkerNode } from "#editor/shared/marker-node";

function createVisibilityEditor() {
	return createEditor({
		namespace: "MarkdownInlineMarkerVisibilityTest",
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

function readVisibility(editor: ReturnType<typeof createVisibilityEditor>) {
	return editor.getEditorState().read(() => $classifyMarkdownInlineMarkerVisibility());
}

describe("$classifyMarkdownInlineMarkerVisibility", () => {
	it("collects all four format owners and activates the owner containing a caret", () => {
		const editor = createVisibilityEditor();
		editor.update(
			() => {
				const paragraph = $createParagraphNode();
				paragraph.append(
					$createMarkdownBoldNode([$createTextNode("bold")]),
					$createMarkdownItalicNode([$createTextNode("italic")]),
					$createMarkdownStrikethroughNode([$createTextNode("strike")]),
					$createMarkdownInlineCodeNode([$createTextNode("code")]),
				);
				$getRoot().append(paragraph);
			},
			{ discrete: true },
		);
		editor.update(
			() => {
				const paragraph = $getRoot().getFirstChild();
				if (!$isElementNode(paragraph)) return;
				const code = paragraph.getChildAtIndex(3);
				if (!$isMarkdownInlineCodeNode(code)) return;
				const body = code.getChildAtIndex(1);
				if (!$isTextNode(body)) return;
				const selection = $createRangeSelection();
				selection.setTextNodeRange(body, 1, body, 1);
				$setSelection(selection);
			},
			{ discrete: true },
		);

		const visibility = readVisibility(editor);
		expect(visibility?.markerKeys.size).toBe(8);
		expect(visibility?.activeMarkerKeys.size).toBe(2);
	});

	it("activates marker carets and collapsed owner boundaries", () => {
		const editor = createVisibilityEditor();
		editor.update(
			() => {
				const paragraph = $createParagraphNode();
				paragraph.append(
					$createTextNode("left"),
					$createMarkdownBoldNode([$createTextNode("bold")]),
					$createTextNode("right"),
				);
				$getRoot().append(paragraph);
			},
			{ discrete: true },
		);

		editor.update(
			() => {
				const paragraph = $getRoot().getFirstChild();
				if (!$isElementNode(paragraph)) return;
				const left = paragraph.getChildAtIndex(0);
				if (!$isTextNode(left)) return;
				const selection = $createRangeSelection();
				selection.setTextNodeRange(
					left,
					left.getTextContentSize(),
					left,
					left.getTextContentSize(),
				);
				$setSelection(selection);
			},
			{ discrete: true },
		);
		expect(readVisibility(editor).activeMarkerKeys.size).toBe(2);

		editor.update(
			() => {
				const paragraph = $getRoot().getFirstChild();
				if (!$isElementNode(paragraph)) return;
				const right = paragraph.getChildAtIndex(2);
				if (!$isTextNode(right)) return;
				const selection = $createRangeSelection();
				selection.setTextNodeRange(right, 0, right, 0);
				$setSelection(selection);
			},
			{ discrete: true },
		);
		expect(readVisibility(editor).activeMarkerKeys.size).toBe(2);

		editor.update(
			() => {
				const paragraph = $getRoot().getFirstChild();
				if (!$isElementNode(paragraph)) return;
				const selection = $createRangeSelection();
				selection.anchor.set(paragraph.getKey(), 1, "element");
				selection.focus.set(paragraph.getKey(), 1, "element");
				$setSelection(selection);
			},
			{ discrete: true },
		);
		expect(readVisibility(editor).activeMarkerKeys.size).toBe(2);

		editor.update(
			() => {
				const paragraph = $getRoot().getFirstChild();
				if (!$isElementNode(paragraph)) return;
				const owner = paragraph.getChildAtIndex(1);
				if (!$isElementNode(owner)) return;
				const marker = owner.getFirstChild();
				if (!$isMarkdownInlineMarkerNode(marker)) return;
				const selection = $createRangeSelection();
				selection.setTextNodeRange(marker, 1, marker, 1);
				$setSelection(selection);
			},
			{ discrete: true },
		);
		expect(readVisibility(editor).activeMarkerKeys.size).toBe(2);
	});

	it("activates nested ancestors but excludes adjacent owners from a range", () => {
		const editor = createVisibilityEditor();
		editor.update(
			() => {
				const paragraph = $createParagraphNode();
				const inner = $createMarkdownItalicNode([$createTextNode("inner")]);
				paragraph.append($createMarkdownBoldNode([inner]));
				$getRoot().append(paragraph);
			},
			{ discrete: true },
		);
		editor.update(
			() => {
				const paragraph = $getRoot().getFirstChild();
				if (!$isElementNode(paragraph)) return;
				const outer = paragraph.getFirstChild();
				if (!$isElementNode(outer)) return;
				const inner = outer.getChildAtIndex(1);
				if (!$isElementNode(inner)) return;
				const body = inner.getChildAtIndex(1);
				if (!$isTextNode(body)) return;
				const selection = $createRangeSelection();
				selection.setTextNodeRange(body, 1, body, 1);
				$setSelection(selection);
			},
			{ discrete: true },
		);
		expect(readVisibility(editor).activeMarkerKeys.size).toBe(4);

		const rangeEditor = createVisibilityEditor();
		rangeEditor.update(
			() => {
				const paragraph = $createParagraphNode();
				paragraph.append(
					$createTextNode("left"),
					$createMarkdownItalicNode([$createTextNode("adjacent")]),
					$createTextNode("right"),
				);
				$getRoot().append(paragraph);
			},
			{ discrete: true },
		);
		rangeEditor.update(
			() => {
				const paragraph = $getRoot().getFirstChild();
				if (!$isElementNode(paragraph)) return;
				const left = paragraph.getChildAtIndex(0);
				if (!$isTextNode(left)) return;
				const selection = $createRangeSelection();
				selection.setTextNodeRange(left, 0, left, left.getTextContentSize());
				$setSelection(selection);
			},
			{ discrete: true },
		);
		expect(readVisibility(rangeEditor).activeMarkerKeys.size).toBe(0);
	});

	it("returns no active markers without a selection and leaves the node tree unchanged", () => {
		const editor = createVisibilityEditor();
		editor.update(
			() => {
				const paragraph = $createParagraphNode();
				paragraph.append($createMarkdownBoldNode([$createTextNode("bold")]));
				$getRoot().append(paragraph);
			},
			{ discrete: true },
		);
		const before = editor.getEditorState().toJSON().root;
		editor.update(() => $setSelection(null), { discrete: true });
		expect(readVisibility(editor).activeMarkerKeys.size).toBe(0);
		expect(editor.getEditorState().toJSON().root).toEqual(before);
	});
});
