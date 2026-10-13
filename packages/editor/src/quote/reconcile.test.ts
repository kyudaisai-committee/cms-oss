import { $isLinkNode, LinkNode } from "@lexical/link";
import { $convertToMarkdownString } from "@lexical/markdown";
import { $createQuoteNode, $isQuoteNode, QuoteNode } from "@lexical/rich-text";
import {
	KEY_BACKSPACE_COMMAND,
	INSERT_LINE_BREAK_COMMAND,
	INSERT_PARAGRAPH_COMMAND,
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
	$isMarkdownInlineCodeNode,
	$isMarkdownItalicNode,
	$isMarkdownStrikethroughNode,
	MarkdownBoldNode,
	MarkdownInlineCodeNode,
	MarkdownItalicNode,
	MarkdownStrikethroughNode,
} from "#editor/inline/nodes";
import { registerMarkdownQuoteCommands } from "#editor/quote/plugin";
import { registerMarkdownQuoteReconciler } from "#editor/quote/reconcile";
import {
	$getMarkdownBlockRawSource,
	$getMarkdownBlockSelectionSnapshot,
} from "#editor/shared/block-source";
import {
	$isMarkdownInlineMarkerNode,
	$createMarkdownInlineMarkerNode,
	MarkdownInlineMarkerNode,
} from "#editor/shared/marker-node";
import { MARKDOWN_EDITOR_TRANSFORMERS } from "#editor/shared/transformers";

function createQuoteEditor() {
	const editor = createEditor({
		namespace: "MarkdownQuoteReconcileTest",
		nodes: [
			QuoteNode,
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
	registerMarkdownQuoteReconciler(editor);
	registerMarkdownQuoteCommands(editor);
	return editor;
}

function appendRawParagraph(
	editor: ReturnType<typeof createQuoteEditor>,
	source: string,
	selectionOffset = 0,
) {
	editor.update(
		() => {
			const paragraph = $createParagraphNode();
			const text = $createTextNode(source);
			paragraph.append(text);
			$getRoot().append(paragraph);
			const selection = $createRangeSelection();
			selection.setTextNodeRange(text, selectionOffset, text, selectionOffset);
			$setSelection(selection);
		},
		{ discrete: true },
	);
}

function appendParagraphAndQuote(
	editor: ReturnType<typeof createQuoteEditor>,
	paragraphSource: string,
	quoteSource: string,
) {
	editor.update(
		() => {
			const paragraph = $createParagraphNode();
			const paragraphText = $createTextNode(paragraphSource);
			paragraph.append(paragraphText);
			const quote = $createQuoteNode();
			quote.append($createMarkdownInlineMarkerNode("> ", "prefix"));
			quote.append($createTextNode(quoteSource.slice(2)));
			$getRoot().append(paragraph, quote);
			const selection = $createRangeSelection();
			selection.setTextNodeRange(
				paragraphText,
				paragraphText.getTextContentSize(),
				paragraphText,
				paragraphText.getTextContentSize(),
			);
			$setSelection(selection);
		},
		{ discrete: true },
	);
}

function appendQuotesAroundParagraph(
	editor: ReturnType<typeof createQuoteEditor>,
	middleSource: string,
) {
	editor.update(
		() => {
			const before = $createQuoteNode();
			before.append($createMarkdownInlineMarkerNode("> ", "prefix"), $createTextNode("before"));
			const middle = $createParagraphNode();
			const middleText = $createTextNode(middleSource);
			middle.append(middleText);
			const after = $createQuoteNode();
			after.append($createMarkdownInlineMarkerNode("> ", "prefix"), $createTextNode("after"));
			$getRoot().append(before, middle, after);
			const selection = $createRangeSelection();
			selection.setTextNodeRange(
				middleText,
				middleText.getTextContentSize(),
				middleText,
				middleText.getTextContentSize(),
			);
			$setSelection(selection);
		},
		{ discrete: true },
	);
}

function setQuoteMarkerSelection(editor: ReturnType<typeof createQuoteEditor>, childIndex: number) {
	editor.update(
		() => {
			const quote = $getRoot().getFirstChild();
			if (!$isQuoteNode(quote)) return;
			const marker = quote.getChildAtIndex(childIndex);
			if (!$isTextNode(marker)) return;
			const selection = $createRangeSelection();
			selection.setTextNodeRange(
				marker,
				marker.getTextContentSize(),
				marker,
				marker.getTextContentSize(),
			);
			$setSelection(selection);
		},
		{ discrete: true },
	);
}

describe("markdown quote reconcile", () => {
	it("keeps an incomplete quote marker as a paragraph", () => {
		const editor = createQuoteEditor();
		appendRawParagraph(editor, ">");

		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			expect($isParagraphNode(paragraph)).toBe(true);
			expect(paragraph?.getTextContent()).toBe(">");
		});
	});

	it("converts a completed quote marker to a standard QuoteNode", () => {
		const editor = createQuoteEditor();
		appendRawParagraph(editor, "> quote");

		editor.getEditorState().read(() => {
			const quote = $getRoot().getFirstChild();
			expect($isQuoteNode(quote)).toBe(true);
			if (!$isQuoteNode(quote)) return;
			expect(quote.getFirstChild()?.getTextContent()).toBe("> ");
			expect(quote.getTextContent()).toBe("> quote");
			expect($isRangeSelection($getSelection())).toBe(true);
		});
	});

	it("merges a quote with a following paragraph that becomes a quote", () => {
		const editor = createQuoteEditor();
		appendRawParagraph(editor, "> before", "> before".length);
		const newSource = "> **new** [link](url)   ";
		appendRawParagraph(editor, newSource, newSource.length);

		editor.getEditorState().read(() => {
			const quote = $getRoot().getFirstChild();
			expect($getRoot().getChildrenSize()).toBe(1);
			expect($isQuoteNode(quote)).toBe(true);
			if (!$isQuoteNode(quote)) return;
			expect($getMarkdownBlockRawSource(quote)).toBe("> before\n> **new** [link](url)   ");
			expect(quote.getChildren().some($isMarkdownBoldNode)).toBe(true);
			expect(quote.getChildren().some($isLinkNode)).toBe(true);
			expect($convertToMarkdownString(MARKDOWN_EDITOR_TRANSFORMERS)).toBe(
				"> before\n> **new** [link](url)   ",
			);
			const selection = $getSelection();
			expect($isRangeSelection(selection)).toBe(true);
			if (!$isRangeSelection(selection)) return;
			expect($getMarkdownBlockSelectionSnapshot(selection)?.anchorOffset).toBe(
				"> before".length + 1 + newSource.length,
			);
		});

		editor.update(
			() => {
				const selection = $getSelection();
				if ($isRangeSelection(selection)) selection.insertText("!");
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const quote = $getRoot().getFirstChild();
			expect($isQuoteNode(quote)).toBe(true);
			if (!$isQuoteNode(quote)) return;
			expect($getMarkdownBlockRawSource(quote)).toBe("> before\n> **new** [link](url)   !");
		});
	});

	it("merges a paragraph that becomes a quote with a following quote", () => {
		const editor = createQuoteEditor();
		appendParagraphAndQuote(editor, "> new", "> after");

		editor.getEditorState().read(() => {
			const quote = $getRoot().getFirstChild();
			expect($getRoot().getChildrenSize()).toBe(1);
			expect($isQuoteNode(quote)).toBe(true);
			if (!$isQuoteNode(quote)) return;
			expect($getMarkdownBlockRawSource(quote)).toBe("> new\n> after");
		});
	});

	it("merges both adjacent quotes around a new quote paragraph", () => {
		const editor = createQuoteEditor();
		appendRawParagraph(editor, "> before", "> before".length);
		appendParagraphAndQuote(editor, "> new", "> after");

		editor.getEditorState().read(() => {
			const quote = $getRoot().getFirstChild();
			expect($getRoot().getChildrenSize()).toBe(1);
			expect($isQuoteNode(quote)).toBe(true);
			if (!$isQuoteNode(quote)) return;
			expect($getMarkdownBlockRawSource(quote)).toBe("> before\n> new\n> after");
			expect($convertToMarkdownString(MARKDOWN_EDITOR_TRANSFORMERS)).toBe(
				"> before\n> new\n> after",
			);
		});
	});

	it("does not merge quotes separated by a normal paragraph", () => {
		const editor = createQuoteEditor();
		appendQuotesAroundParagraph(editor, "middle");

		editor.getEditorState().read(() => {
			expect($getRoot().getChildrenSize()).toBe(3);
			expect($isQuoteNode($getRoot().getChildAtIndex(0))).toBe(true);
			expect($isParagraphNode($getRoot().getChildAtIndex(1))).toBe(true);
			expect($isQuoteNode($getRoot().getChildAtIndex(2))).toBe(true);
		});
	});

	it("inserts a canonical marker after a quote line break and keeps the caret there", () => {
		const editor = createQuoteEditor();
		appendRawParagraph(editor, "> one");

		editor.update(
			() => {
				const quote = $getRoot().getFirstChild();
				if (!$isQuoteNode(quote)) return;
				const body = quote.getChildAtIndex(1);
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
			expect(selection.anchor.type).toBe("text");
			expect(selection.anchor.key).toBe(selection.focus.key);
		});
		editor.update(
			() => {
				expect(editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND)).toBe(true);
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const quote = $getRoot().getFirstChild();
			const selection = $getSelection();
			expect($isQuoteNode(quote)).toBe(true);
			expect($isRangeSelection(selection)).toBe(true);
			if (!$isQuoteNode(quote) || !$isRangeSelection(selection)) return;
			expect($getMarkdownBlockRawSource(quote)).toBe("> one\n> ");
			expect(quote.getChildrenSize()).toBe(4);
			expect(quote.getTextContent()).toBe("> one\n> ");
			expect(quote.getChildAtIndex(2)?.getTextContent()).toBe("\n");
			expect(quote.getChildAtIndex(3)?.getTextContent()).toBe("> ");
			expect(selection.anchor.type).toBe("element");
			expect(selection.anchor.key).toBe(quote.getKey());
			expect(selection.anchor.offset).toBe(4);
			expect($getMarkdownBlockSelectionSnapshot(selection)?.anchorOffset).toBe(8);
		});

		editor.update(
			() => {
				const selection = $getSelection();
				if ($isRangeSelection(selection)) selection.insertText("next");
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			expect($getRoot().getFirstChild()?.getTextContent()).toBe("> one\n> next");
		});
	});

	it("keeps both sides of a quote body when breaking in the middle", () => {
		const editor = createQuoteEditor();
		appendRawParagraph(editor, "> abcd");

		editor.update(
			() => {
				const quote = $getRoot().getFirstChild();
				if (!$isQuoteNode(quote)) return;
				const body = quote.getChildAtIndex(1);
				if (!$isTextNode(body)) return;
				const selection = $createRangeSelection();
				selection.setTextNodeRange(body, 2, body, 2);
				$setSelection(selection);
			},
			{ discrete: true },
		);
		editor.update(
			() => {
				expect(editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND)).toBe(true);
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			expect($getRoot().getFirstChild()?.getTextContent()).toBe("> ab\n> cd");
		});
	});

	it("inserts a quote line break before the body at offset zero", () => {
		const editor = createQuoteEditor();
		appendRawParagraph(editor, "> one");

		editor.update(
			() => {
				const quote = $getRoot().getFirstChild();
				if (!$isQuoteNode(quote)) return;
				const body = quote.getChildAtIndex(1);
				if (!$isTextNode(body)) return;
				const selection = $createRangeSelection();
				selection.setTextNodeRange(body, 0, body, 0);
				$setSelection(selection);
			},
			{ discrete: true },
		);
		editor.update(
			() => {
				expect(editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND)).toBe(true);
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const quote = $getRoot().getFirstChild();
			expect($isQuoteNode(quote)).toBe(true);
			if (!$isQuoteNode(quote)) return;
			expect($getMarkdownBlockRawSource(quote)).toBe("> \n> one");
			expect(quote.getChildren().filter($isMarkdownInlineMarkerNode)).toHaveLength(2);
		});

		editor.update(
			() => {
				const selection = $getSelection();
				if ($isRangeSelection(selection)) selection.insertText("next");
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const quote = $getRoot().getFirstChild();
			expect($isQuoteNode(quote)).toBe(true);
			if (!$isQuoteNode(quote)) return;
			expect($getMarkdownBlockRawSource(quote)).toBe("> next\n> one");
		});
	});

	it("exits a quote-only empty line on Enter", () => {
		const editor = createQuoteEditor();
		appendRawParagraph(editor, "> ");
		setQuoteMarkerSelection(editor, 0);

		editor.update(
			() => {
				expect(editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND)).toBe(true);
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			expect($isParagraphNode(paragraph)).toBe(true);
			expect(paragraph?.getTextContent()).toBe("");
			const selection = $getSelection();
			expect($isRangeSelection(selection)).toBe(true);
			if (!$isRangeSelection(selection) || !paragraph) return;
			expect(selection.anchor.type).toBe("element");
			expect(selection.anchor.key).toBe(paragraph.getKey());
			expect(selection.anchor.offset).toBe(0);
		});
	});

	it("exits a quote-only empty line on Backspace", () => {
		const editor = createQuoteEditor();
		appendRawParagraph(editor, "> ");
		setQuoteMarkerSelection(editor, 0);

		editor.update(
			() => {
				const event = new Event("keydown") as KeyboardEvent;
				expect(editor.dispatchCommand(KEY_BACKSPACE_COMMAND, event)).toBe(true);
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			expect($isParagraphNode(paragraph)).toBe(true);
			expect(paragraph?.getTextContent()).toBe("");
			const selection = $getSelection();
			expect($isRangeSelection(selection)).toBe(true);
			if (!$isRangeSelection(selection) || !paragraph) return;
			expect(selection.anchor.key).toBe(paragraph.getKey());
			expect(selection.anchor.offset).toBe(0);
		});
	});

	it("keeps an empty quote line on Shift+Return", () => {
		const editor = createQuoteEditor();
		appendRawParagraph(editor, "> ");
		setQuoteMarkerSelection(editor, 0);

		editor.update(
			() => {
				expect(editor.dispatchCommand(INSERT_LINE_BREAK_COMMAND, false)).toBe(true);
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const quote = $getRoot().getFirstChild();
			expect($isQuoteNode(quote)).toBe(true);
			if (!$isQuoteNode(quote)) return;
			expect($getMarkdownBlockRawSource(quote)).toBe("> \n> ");
			expect(quote.getChildren().filter($isMarkdownInlineMarkerNode)).toHaveLength(2);
		});
	});

	it("exits a trailing empty quote line on Backspace", () => {
		const editor = createQuoteEditor();
		appendRawParagraph(editor, "> one\n> ");
		setQuoteMarkerSelection(editor, 3);

		editor.update(
			() => {
				const event = new Event("keydown") as KeyboardEvent;
				expect(editor.dispatchCommand(KEY_BACKSPACE_COMMAND, event)).toBe(true);
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const quote = $getRoot().getFirstChild();
			const paragraph = $getRoot().getChildAtIndex(1);
			expect($isQuoteNode(quote)).toBe(true);
			expect($isParagraphNode(paragraph)).toBe(true);
			if (!$isQuoteNode(quote) || !$isParagraphNode(paragraph)) return;
			expect($getMarkdownBlockRawSource(quote)).toBe("> one");
			expect(paragraph.getTextContent()).toBe("");
			expect($convertToMarkdownString(MARKDOWN_EDITOR_TRANSFORMERS)).toBe("> one\n");
			const selection = $getSelection();
			expect($isRangeSelection(selection)).toBe(true);
			if (!$isRangeSelection(selection)) return;
			expect(selection.anchor.key).toBe(paragraph.getKey());
			expect(selection.anchor.offset).toBe(0);
		});
	});

	it("exits a trailing empty quote line on Enter", () => {
		const editor = createQuoteEditor();
		appendRawParagraph(editor, "> one\n> ");
		setQuoteMarkerSelection(editor, 3);

		editor.update(
			() => {
				expect(editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND)).toBe(true);
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const quote = $getRoot().getFirstChild();
			const paragraph = $getRoot().getChildAtIndex(1);
			expect($isQuoteNode(quote)).toBe(true);
			expect($isParagraphNode(paragraph)).toBe(true);
			if (!$isQuoteNode(quote) || !$isParagraphNode(paragraph)) return;
			expect($getMarkdownBlockRawSource(quote)).toBe("> one");
			expect(paragraph.getTextContent()).toBe("");
			const selection = $getSelection();
			expect($isRangeSelection(selection)).toBe(true);
			if (!$isRangeSelection(selection)) return;
			expect(selection.anchor.key).toBe(paragraph.getKey());
			expect(selection.anchor.offset).toBe(0);
		});
	});

	it("splits around a middle empty quote line on Backspace", () => {
		const editor = createQuoteEditor();
		appendRawParagraph(editor, "> before\n> \n> after");
		setQuoteMarkerSelection(editor, 3);

		editor.update(
			() => {
				const event = new Event("keydown") as KeyboardEvent;
				expect(editor.dispatchCommand(KEY_BACKSPACE_COMMAND, event)).toBe(true);
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const before = $getRoot().getChildAtIndex(0);
			const paragraph = $getRoot().getChildAtIndex(1);
			const after = $getRoot().getChildAtIndex(2);
			expect($isQuoteNode(before)).toBe(true);
			expect($isParagraphNode(paragraph)).toBe(true);
			expect($isQuoteNode(after)).toBe(true);
			if (!$isQuoteNode(before) || !$isParagraphNode(paragraph) || !$isQuoteNode(after)) return;
			expect($getMarkdownBlockRawSource(before)).toBe("> before");
			expect(paragraph.getTextContent()).toBe("");
			expect($getMarkdownBlockRawSource(after)).toBe("> after");
			expect($convertToMarkdownString(MARKDOWN_EDITOR_TRANSFORMERS)).toBe("> before\n\n> after");
			const selection = $getSelection();
			expect($isRangeSelection(selection)).toBe(true);
			if (!$isRangeSelection(selection)) return;
			expect(selection.anchor.key).toBe(paragraph.getKey());
			expect(selection.anchor.offset).toBe(0);
		});
	});

	it("splits a leading empty quote line into paragraph and quote", () => {
		const editor = createQuoteEditor();
		appendRawParagraph(editor, "> \n> after");
		setQuoteMarkerSelection(editor, 0);

		editor.update(
			() => {
				const event = new Event("keydown") as KeyboardEvent;
				expect(editor.dispatchCommand(KEY_BACKSPACE_COMMAND, event)).toBe(true);
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getChildAtIndex(0);
			const quote = $getRoot().getChildAtIndex(1);
			expect($isParagraphNode(paragraph)).toBe(true);
			expect($isQuoteNode(quote)).toBe(true);
			if (!$isParagraphNode(paragraph) || !$isQuoteNode(quote)) return;
			expect(paragraph.getTextContent()).toBe("");
			expect($getMarkdownBlockRawSource(quote)).toBe("> after");
		});
	});

	it("canonicalizes every quote line and preserves inline content and trivia", () => {
		const source = "> **bold** [link](url)   \n> *italic* ~~strike~~ `code`  ";
		const editor = createQuoteEditor();
		appendRawParagraph(editor, source);

		editor.getEditorState().read(() => {
			const quote = $getRoot().getFirstChild();
			expect($isQuoteNode(quote)).toBe(true);
			if (!$isQuoteNode(quote)) return;
			const children = quote.getChildren();
			expect(
				children.filter(
					(child) => $isMarkdownInlineMarkerNode(child) && child.getMarkerSide() === "prefix",
				),
			).toHaveLength(2);
			expect(children.some($isMarkdownBoldNode)).toBe(true);
			expect(children.some($isMarkdownItalicNode)).toBe(true);
			expect(children.some($isMarkdownStrikethroughNode)).toBe(true);
			expect(children.some($isMarkdownInlineCodeNode)).toBe(true);
			expect(children.some($isLinkNode)).toBe(true);
			expect(quote.getTextContent()).toBe(source);
			expect($convertToMarkdownString(MARKDOWN_EDITOR_TRANSFORMERS)).toBe(source);
		});
	});

	it("preserves spaces typed after the quote marker as body text", () => {
		const source = ">   body";
		const editor = createQuoteEditor();
		appendRawParagraph(editor, source);

		editor.getEditorState().read(() => {
			const quote = $getRoot().getFirstChild();
			expect($isQuoteNode(quote)).toBe(true);
			if (!$isQuoteNode(quote)) return;
			expect(quote.getFirstChild()?.getTextContent()).toBe("> ");
			expect(quote.getChildAtIndex(1)?.getTextContent()).toBe("  body");
			expect($getMarkdownBlockRawSource(quote)).toBe(source);
		});
	});

	it("demotes to a paragraph when a quote line marker is removed", () => {
		const editor = createQuoteEditor();
		appendRawParagraph(editor, "> one\n> two");

		editor.update(
			() => {
				const quote = $getRoot().getFirstChild();
				if (!$isQuoteNode(quote)) return;
				quote.getChildAtIndex(3)?.remove();
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const paragraph = $getRoot().getFirstChild();
			expect($isParagraphNode(paragraph)).toBe(true);
			expect(paragraph?.getTextContent()).toBe("> one\ntwo");
		});
	});

	it("leaves the node tree unchanged for selection-only updates", () => {
		const editor = createQuoteEditor();
		appendRawParagraph(editor, "> quote");
		const before = editor.getEditorState().toJSON().root;

		editor.update(
			() => {
				const quote = $getRoot().getFirstChild();
				if (!$isQuoteNode(quote)) return;
				const body = quote.getChildAtIndex(1);
				if (!$isTextNode(body)) return;
				const selection = $createRangeSelection();
				selection.setTextNodeRange(body, 0, body, body.getTextContentSize());
				$setSelection(selection);
			},
			{ discrete: true },
		);

		editor.getEditorState().read(() => {
			const selection = $getSelection();
			expect($isRangeSelection(selection)).toBe(true);
		});
		expect(editor.getEditorState().toJSON().root).toEqual(before);
	});
});
