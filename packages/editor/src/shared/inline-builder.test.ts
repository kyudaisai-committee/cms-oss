import { $isLinkNode, LinkNode } from "@lexical/link";
import { $createParagraphNode, $getRoot, $isElementNode, $isTextNode, createEditor } from "lexical";
import { describe, expect, it } from "vitest";

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
import {
	$getStructuredLinkRole,
	$isStructuredLink,
	$setStructuredLinkUrl,
} from "#editor/link/model";
import { $buildMarkdownInlineNodes } from "#editor/shared/inline-builder";
import { MarkdownInlineMarkerNode } from "#editor/shared/marker-node";
import { parseMarkdown } from "#editor/shared/parser";

function createBuilderEditor() {
	return createEditor({
		namespace: "MarkdownInlineBuilderTest",
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

function buildParagraph(source: string) {
	const editor = createBuilderEditor();
	const root = parseMarkdown(source);
	const paragraph = root.children.find((child) => child.type === "paragraph");
	if (!paragraph || paragraph.type !== "paragraph") throw new Error("Expected a paragraph");

	editor.update(
		() => {
			const lexicalParagraph = $createParagraphNode();
			lexicalParagraph.append(...$buildMarkdownInlineNodes(paragraph.children, source));
			$getRoot().append(lexicalParagraph);
		},
		{ discrete: true },
	);
	return editor;
}

describe("$buildMarkdownInlineNodes", () => {
	it("builds exact nested inline owners and structured links", () => {
		const source =
			'before **bold** *italic* ~~gone~~ ``code`` [label](https://example.test "title") after';
		const editor = buildParagraph(source);

		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			expect($isElementNode(paragraph)).toBe(true);
			if (!$isElementNode(paragraph)) return;
			expect(paragraph.getTextContent()).toBe(source);
			expect(paragraph.getChildren().some($isMarkdownBoldNode)).toBe(true);
			expect(paragraph.getChildren().some($isMarkdownItalicNode)).toBe(true);
			expect(paragraph.getChildren().some($isMarkdownStrikethroughNode)).toBe(true);
			expect(paragraph.getChildren().some($isMarkdownInlineCodeNode)).toBe(true);

			const link = paragraph.getChildren().find($isLinkNode);
			expect($isLinkNode(link)).toBe(true);
			if (!$isLinkNode(link)) return;
			expect($isStructuredLink(link)).toBe(true);
			expect(link.getTitle()).toBe("title");
			expect(link.getChildren()[0]).toBeInstanceOf(MarkdownInlineMarkerNode);
			expect($isTextNode(link.getChildren()[3])).toBe(true);
			expect(link.getChildren()[3]).not.toBeInstanceOf(MarkdownInlineMarkerNode);
			expect(link.getChildren().map($getStructuredLinkRole)).toEqual([
				"prefix",
				"label",
				"separator",
				"url",
				"suffix",
			]);
		});
	});

	it("stores no link role state and updates the standard URL node", () => {
		const source = '[label](https://example.test "title")';
		const editor = buildParagraph(source);

		let linkKey = "";
		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			if (!$isElementNode(paragraph)) return;
			const link = paragraph.getFirstChild();
			if (!$isLinkNode(link)) return;
			linkKey = link.getKey();
			expect(JSON.stringify(link.exportJSON())).not.toContain("structuredLink");
		});

		editor.update(
			() => {
				const paragraph = $getRoot().getFirstChild();
				if (!$isElementNode(paragraph)) return;
				const link = paragraph.getFirstChild();
				if ($isLinkNode(link)) $setStructuredLinkUrl(link, "https://changed.test");
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			if (!$isElementNode(paragraph)) return;
			const link = paragraph.getFirstChild();
			expect($isLinkNode(link)).toBe(true);
			if (!$isLinkNode(link)) return;
			expect(link.getKey()).toBe(linkKey);
			expect(link.getURL()).toBe("https://changed.test");
			expect(link.getChildren()[3]?.getTextContent()).toBe("https://changed.test");
		});
	});

	it("keeps escaped labels and parenthesized destinations in completed links", () => {
		const source = "[label \\[extra\\]](https://example.test/path_(v1))";
		const editor = buildParagraph(source);

		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			expect($isElementNode(paragraph)).toBe(true);
			if (!$isElementNode(paragraph)) return;
			expect(paragraph.getTextContent()).toBe(source);
			const link = paragraph.getChildren().find($isLinkNode);
			expect($isLinkNode(link)).toBe(true);
			if (!$isLinkNode(link)) return;
			expect($isStructuredLink(link)).toBe(true);
			expect(link.getURL()).toBe("https://example.test/path_(v1)");
		});
	});

	it("preserves nested emphasis, alternate delimiters, and code fence runs", () => {
		const source = "before ***x*** **a *b* c** __underlined__ ~~strike~~ ```code``` after";
		const editor = buildParagraph(source);

		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			expect($isElementNode(paragraph)).toBe(true);
			if (!$isElementNode(paragraph)) return;
			expect(paragraph.getTextContent()).toBe(source);
			expect(paragraph.getChildren().some($isMarkdownBoldNode)).toBe(true);
			expect(paragraph.getChildren().some($isMarkdownItalicNode)).toBe(true);
			expect(paragraph.getChildren().some($isMarkdownInlineCodeNode)).toBe(true);
			expect(paragraph.getChildren().some($isMarkdownStrikethroughNode)).toBe(true);
		});
	});

	it("keeps unsupported phrasing source as literal text", () => {
		const source = "before ![image](image.png) after";
		const editor = buildParagraph(source);

		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			expect($isElementNode(paragraph)).toBe(true);
			if (!$isElementNode(paragraph)) return;
			expect(paragraph.getTextContent()).toBe(source);
			expect(paragraph.getChildren().every((child) => !$isLinkNode(child))).toBe(true);
		});
	});

	it.each([
		"[]()",
		"[](https://example.test)",
		"[label]()",
		"[label](https://example.test",
		"https://example.test",
		"<https://example.test>",
	])("keeps incomplete syntax and URLs as editable source: %s", (source) => {
		const editor = buildParagraph(source);

		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			expect($isElementNode(paragraph)).toBe(true);
			if (!$isElementNode(paragraph)) return;
			expect(paragraph.getTextContent()).toBe(source);
			expect(paragraph.getChildren().every((child) => !$isLinkNode(child))).toBe(true);
		});
	});

	it("preserves gaps and trailing spaces outside inline nodes", () => {
		const sources = ["text ", "text   ", "**bold**  [link](url)   ", "**a *b*  c**"];

		for (const source of sources) {
			const editor = buildParagraph(source);
			editor.getEditorState().read(() => {
				const paragraph = $getRoot().getFirstChild();
				expect($isElementNode(paragraph)).toBe(true);
				if ($isElementNode(paragraph)) expect(paragraph.getTextContent()).toBe(source);
			});
		}
	});
});
