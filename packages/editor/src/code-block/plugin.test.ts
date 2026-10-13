import { $createCodeNode, $isCodeNode, CodeNode } from "@lexical/code";
import { $convertFromMarkdownString, $convertToMarkdownString } from "@lexical/markdown";
import {
	$createParagraphNode,
	$createRangeSelection,
	$createTextNode,
	$getRoot,
	$getSelection,
	$isParagraphNode,
	$isRangeSelection,
	$setSelection,
	createEditor,
} from "lexical";
import { describe, expect, it } from "vitest";

import {
	MARKDOWN_CODE_FENCE_TRANSFORMER,
	registerMarkdownCodeBlockShortcut,
} from "#editor/code-block/plugin";

function createCodeEditor() {
	const editor = createEditor({
		namespace: "MarkdownCodeBlockShortcutTest",
		nodes: [CodeNode],
		onError: (error) => {
			throw error;
		},
	});
	registerMarkdownCodeBlockShortcut(editor);
	return editor;
}

function typeParagraph(editor: ReturnType<typeof createCodeEditor>, source: string) {
	editor.update(
		() => {
			const paragraph = $createParagraphNode();
			const text = $createTextNode(source);
			paragraph.append(text);
			$getRoot().append(paragraph);
			const selection = $createRangeSelection();
			selection.setTextNodeRange(text, text.getTextContentSize(), text, text.getTextContentSize());
			$setSelection(selection);
		},
		{ discrete: true },
	);
}

describe("markdown code block shortcut", () => {
	it("turns three backticks in an empty paragraph into an editable code body immediately", () => {
		const editor = createCodeEditor();
		typeParagraph(editor, "```");

		editor.getEditorState().read(() => {
			const code = $getRoot().getFirstChild();
			const selection = $getSelection();
			expect($isCodeNode(code)).toBe(true);
			if (!$isCodeNode(code)) return;
			expect(code.getChildrenSize()).toBe(0);
			expect($isRangeSelection(selection)).toBe(true);
			if (!$isRangeSelection(selection)) return;
			expect(selection.anchor.getNode()).toBe(code);
			expect(selection.anchor.type).toBe("element");
			expect(selection.anchor.offset).toBe(0);
		});

		editor.update(
			() => {
				const selection = $getSelection();
				if (!$isRangeSelection(selection)) return;
				selection.insertText("const value = 1;");
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			expect($isCodeNode($getRoot().getFirstChild())).toBe(true);
			expect($convertToMarkdownString([MARKDOWN_CODE_FENCE_TRANSFORMER])).toBe(
				"```\nconst value = 1;\n```",
			);
		});
	});

	it("only converts a paragraph consisting of the three opening markers", () => {
		const editor = createCodeEditor();
		typeParagraph(editor, "prefix ```");

		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			expect($isParagraphNode(paragraph)).toBe(true);
			expect(paragraph?.getTextContent()).toBe("prefix ```");
		});
	});

	it("imports language and exports a safe fence around literal backticks in the body", () => {
		const editor = createCodeEditor();
		editor.update(
			() => {
				$convertFromMarkdownString("```ts\nconst value = ````;\n```", [
					MARKDOWN_CODE_FENCE_TRANSFORMER,
				]);
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const code = $getRoot().getFirstChild();
			expect($isCodeNode(code)).toBe(true);
			if (!$isCodeNode(code)) return;
			expect(code.getLanguage()).toBe("ts");
			expect(code.getTextContent()).toBe("const value = ````;");
			expect($convertToMarkdownString([MARKDOWN_CODE_FENCE_TRANSFORMER])).toBe(
				"`````ts\nconst value = ````;\n`````",
			);
		});
	});

	it("creates code nodes through the standard markdown transformer", () => {
		const editor = createCodeEditor();
		editor.update(
			() => {
				const code = $createCodeNode("js");
				code.append($createTextNode("console.log('ready');"));
				$getRoot().append(code);
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const code = $getRoot().getFirstChild();
			expect($isCodeNode(code)).toBe(true);
			if (!$isCodeNode(code)) return;
			expect(code.getLanguage()).toBe("js");
			expect($convertToMarkdownString([MARKDOWN_CODE_FENCE_TRANSFORMER])).toContain(
				"```js\nconsole.log('ready');\n```",
			);
		});
	});
});
