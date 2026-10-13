import { $convertToMarkdownString } from "@lexical/markdown";
import { $isHeadingNode, $isQuoteNode } from "@lexical/rich-text";
import { $getRoot, $isParagraphNode, createEditor, type EditorState } from "lexical";
import { describe, expect, it } from "vitest";

import { createEditorConfig } from "#editor/config";
import {
	$isMarkdownBoldNode,
	$isMarkdownInlineCodeNode,
	$isMarkdownItalicNode,
	$isMarkdownStrikethroughNode,
} from "#editor/inline/nodes";
import { MARKDOWN_EDITOR_TRANSFORMERS } from "#editor/shared/transformers";

function createConfiguredEditor(source: string) {
	const config = createEditorConfig(source);
	const editor = createEditor({
		namespace: config.namespace ?? "MarkdownEditor",
		nodes: (typeof config.nodes === "function" ? config.nodes() : config.nodes) ?? [],
		theme: config.theme ?? {},
		onError: (error) => {
			throw error;
		},
	});
	const editorState = config.$initialEditorState;
	if (typeof editorState !== "function") throw new Error("初期editorStateがありません。");
	editor.update(() => editorState(editor), { discrete: true });
	return editor;
}

function getOnChangeMarkdown(editorState: EditorState) {
	let markdown = "";
	editorState.read(() => {
		markdown = $convertToMarkdownString(MARKDOWN_EDITOR_TRANSFORMERS);
	});
	return markdown;
}

describe("createEditorConfig inline Markdown integration", () => {
	it("canonicalizes initial paragraphs and preserves OnChange Markdown", () => {
		const source = "before **bold** *italic* ~~strike~~ `code` after";
		const editor = createConfiguredEditor(source);

		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			expect($isParagraphNode(paragraph)).toBe(true);
			if (!$isParagraphNode(paragraph)) return;
			expect(paragraph.getChildren().some($isMarkdownBoldNode)).toBe(true);
			expect(paragraph.getChildren().some($isMarkdownItalicNode)).toBe(true);
			expect(paragraph.getChildren().some($isMarkdownStrikethroughNode)).toBe(true);
			expect(paragraph.getChildren().some($isMarkdownInlineCodeNode)).toBe(true);
		});

		expect(getOnChangeMarkdown(editor.getEditorState())).toBe(source);
	});

	it("keeps initial h1 Markdown as paragraph text", () => {
		const editor = createConfiguredEditor("# title");

		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			expect($isParagraphNode(paragraph)).toBe(true);
			if (!$isParagraphNode(paragraph)) return;
			expect(paragraph.getTextContent()).toBe("# title");
		});

		expect(getOnChangeMarkdown(editor.getEditorState())).toBe("# title");
	});

	it("canonicalizes initial h2 Markdown through the shared reconcile path", () => {
		const editor = createConfiguredEditor("## title");

		editor.getEditorState().read(() => {
			const heading = $getRoot().getFirstChild();
			expect($isHeadingNode(heading)).toBe(true);
			if (!$isHeadingNode(heading)) return;
			expect(heading.getTag()).toBe("h2");
			expect(heading.getFirstChild()?.getTextContent()).toBe("## ");
		});

		expect(getOnChangeMarkdown(editor.getEditorState())).toBe("## title");
	});

	it("canonicalizes initial quote Markdown through the shared reconcile path", () => {
		const editor = createConfiguredEditor("> quote");

		editor.getEditorState().read(() => {
			const quote = $getRoot().getFirstChild();
			expect($isQuoteNode(quote)).toBe(true);
			if (!$isQuoteNode(quote)) return;
			expect(quote.getFirstChild()?.getTextContent()).toBe("> ");
		});

		expect(getOnChangeMarkdown(editor.getEditorState())).toBe("> quote");
	});
});
