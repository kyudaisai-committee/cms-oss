import {
	$createParagraphNode,
	$createTextNode,
	$getRoot,
	$isElementNode,
	createEditor,
} from "lexical";
import { describe, expect, it } from "vitest";

import {
	$createMarkdownBoldNode,
	$createMarkdownInlineCodeNode,
	$createMarkdownItalicNode,
	$createMarkdownStrikethroughNode,
	$isMarkdownBoldNode,
	$isMarkdownInlineCodeNode,
	$isMarkdownItalicNode,
	$isMarkdownStrikethroughNode,
	MarkdownBoldNode,
	MarkdownInlineCodeNode,
	MarkdownInlineFormatNode,
	MarkdownItalicNode,
	MarkdownStrikethroughNode,
} from "#editor/inline/nodes";
import {
	$createMarkdownInlineMarkerNode,
	MarkdownInlineMarkerNode,
} from "#editor/shared/marker-node";

function createInlineFormatEditor() {
	return createEditor({
		namespace: "MarkdownInlineFormatNodeTest",
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

describe("MarkdownInlineFormatNode", () => {
	it("serializes markers with side only", () => {
		const editor = createInlineFormatEditor();

		editor.update(
			() => {
				const paragraph = $createParagraphNode();
				paragraph.append($createMarkdownInlineMarkerNode("**", "prefix"));
				$getRoot().append(paragraph);
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			if (!$isElementNode(paragraph)) return;
			const marker = paragraph.getFirstChild();
			if (!marker || !(marker instanceof MarkdownInlineMarkerNode)) return;
			const serialized = marker.exportJSON();
			expect(serialized.side).toBe("prefix");
			expect(serialized).not.toHaveProperty("markerFormat");
		});
	});

	it("creates each owner with canonical marker/content children", () => {
		const editor = createInlineFormatEditor();

		editor.update(
			() => {
				const paragraph = $createParagraphNode();
				const nestedItalic = $createMarkdownItalicNode([$createTextNode("nested")]);
				const owners = [
					$createMarkdownBoldNode([nestedItalic]),
					$createMarkdownStrikethroughNode([$createTextNode("strike")]),
					$createMarkdownInlineCodeNode([$createTextNode("code")]),
				];
				paragraph.append(...owners);
				$getRoot().append(paragraph);
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			expect($isElementNode(paragraph)).toBe(true);
			if (!$isElementNode(paragraph)) return;
			const [bold, strike, code] = paragraph.getChildren();
			expect($isMarkdownBoldNode(bold)).toBe(true);
			expect($isMarkdownStrikethroughNode(strike)).toBe(true);
			expect($isMarkdownInlineCodeNode(code)).toBe(true);
			if (
				!$isMarkdownBoldNode(bold) ||
				!$isMarkdownStrikethroughNode(strike) ||
				!$isMarkdownInlineCodeNode(code)
			)
				return;
			expect(bold.getChildren().map((child) => child.getTextContent())).toEqual([
				"**",
				"*nested*",
				"**",
			]);
			expect($isMarkdownItalicNode(bold.getChildAtIndex(1))).toBe(true);
			expect(strike.getChildren().map((child) => child.getTextContent())).toEqual([
				"~~",
				"strike",
				"~~",
			]);
			expect(code.getChildren().map((child) => child.getTextContent())).toEqual(["`", "code", "`"]);
			expect(bold instanceof MarkdownInlineFormatNode).toBe(true);
			expect(strike instanceof MarkdownInlineFormatNode).toBe(true);
			expect(code instanceof MarkdownInlineFormatNode).toBe(true);
		});
	});

	it("round-trips owner JSON and preserves concrete types", () => {
		const editor = createInlineFormatEditor();

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

		const serialized = editor.getEditorState().toJSON();
		const restoredEditor = createInlineFormatEditor();
		restoredEditor.setEditorState(restoredEditor.parseEditorState(serialized));

		restoredEditor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			expect($isElementNode(paragraph)).toBe(true);
			if (!$isElementNode(paragraph)) return;
			const children = paragraph.getChildren();
			expect(children.map((child) => child.getType())).toEqual([
				"markdown-bold",
				"markdown-italic",
				"markdown-strikethrough",
				"markdown-inline-code",
			]);
			expect($isMarkdownBoldNode(children[0])).toBe(true);
			expect($isMarkdownItalicNode(children[1])).toBe(true);
			expect($isMarkdownStrikethroughNode(children[2])).toBe(true);
			expect($isMarkdownInlineCodeNode(children[3])).toBe(true);
			expect(children.map((child) => child.getTextContent())).toEqual([
				"**bold**",
				"*italic*",
				"~~strike~~",
				"`code`",
			]);
		});

		let cloneIsItalic = false;
		restoredEditor.update(
			() => {
				const clone = MarkdownItalicNode.clone(new MarkdownItalicNode());
				cloneIsItalic = $isMarkdownItalicNode(clone);
			},
			{ discrete: true },
		);
		expect(cloneIsItalic).toBe(true);
	});
});
