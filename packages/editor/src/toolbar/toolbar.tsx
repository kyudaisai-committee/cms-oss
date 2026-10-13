import { TooltipProvider } from "@cloudflare/kumo";
import { $createCodeNode } from "@lexical/code";
import { INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND } from "@lexical/list";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
	$createHeadingNode,
	$createQuoteNode,
	$isHeadingNode,
	$isQuoteNode,
} from "@lexical/rich-text";
import {
	REDO_COMMAND,
	UNDO_COMMAND,
	$getSelection,
	$isRangeSelection,
	type EditorState,
} from "lexical";
import {
	BoldIcon,
	CodeIcon,
	Heading2Icon,
	Heading3Icon,
	ItalicIcon,
	ListIcon,
	ListOrderedIcon,
	MessageSquareQuoteIcon,
	Redo2Icon,
	StrikethroughIcon,
	Undo2Icon,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
	$findMarkdownInlineFormatAncestor,
	toggleMarkdownInlineFormat,
} from "#editor/inline/command";
import type { MarkdownInlineFormat } from "#editor/inline/nodes";
import { $findLinkNodeFromSelection } from "#editor/link/selection";
import { LinkToolbarButton } from "#editor/link/toolbar-button";
import { $findBlockAncestor, $findListAncestor } from "#editor/shared/ancestors";
import { BlockTypeButton, ToolbarButton, $updateSelectedBlocks } from "#editor/toolbar/controls";

type ToolbarState = {
	bold: boolean;
	italic: boolean;
	strikethrough: boolean;
	inlineCode: boolean;
	heading: "h2" | "h3" | null;
	quote: boolean;
	unorderedList: boolean;
	orderedList: boolean;
	codeBlock: boolean;
	link: boolean;
};

function createToolbarState(): ToolbarState {
	return {
		bold: false,
		italic: false,
		strikethrough: false,
		inlineCode: false,
		heading: null,
		quote: false,
		unorderedList: false,
		orderedList: false,
		codeBlock: false,
		link: false,
	};
}

function $getToolbarState(editorState: EditorState) {
	const nextState = createToolbarState();
	editorState.read(() => {
		const selection = $getSelection();
		if (!$isRangeSelection(selection)) return;

		const anchorNode = selection.anchor.getNode();
		nextState.bold = $findMarkdownInlineFormatAncestor(anchorNode, "bold") !== null;
		nextState.italic = $findMarkdownInlineFormatAncestor(anchorNode, "italic") !== null;
		nextState.strikethrough =
			$findMarkdownInlineFormatAncestor(anchorNode, "strikethrough") !== null;
		nextState.inlineCode = $findMarkdownInlineFormatAncestor(anchorNode, "code") !== null;

		const blockNode = $findBlockAncestor(anchorNode);
		if (blockNode) {
			if ($isHeadingNode(blockNode)) {
				const tag = blockNode.getTag();
				if (tag === "h2" || tag === "h3") nextState.heading = tag;
			}
			nextState.quote = $isQuoteNode(blockNode);
			nextState.codeBlock = blockNode.getType() === "code";
		}

		const listNode = $findListAncestor(anchorNode);
		if (listNode) {
			nextState.unorderedList = listNode.getListType() === "bullet";
			nextState.orderedList = listNode.getListType() === "number";
		}
		nextState.link = $findLinkNodeFromSelection(selection) !== null;
	});
	return nextState;
}

export function MarkdownToolbar() {
	const [editor] = useLexicalComposerContext();
	const [toolbarState, setToolbarState] = useState(createToolbarState);

	useEffect(() => {
		const $syncToolbarState = (editorState: EditorState) => {
			setToolbarState($getToolbarState(editorState));
		};
		const removeUpdateListener = editor.registerUpdateListener(({ editorState }) => {
			$syncToolbarState(editorState);
		});
		$syncToolbarState(editor.getEditorState());

		return () => {
			removeUpdateListener();
		};
	}, [editor]);

	const dispatchFormat = (format: MarkdownInlineFormat) => {
		toggleMarkdownInlineFormat(editor, format);
	};

	return (
		<TooltipProvider>
			<div
				aria-label="書式設定"
				className="border-kumo-line flex flex-wrap items-center gap-0.5 border-b p-2"
				role="toolbar"
			>
				<ToolbarButton
					active={toolbarState.bold}
					label="太字"
					icon={BoldIcon}
					onClick={() => dispatchFormat("bold")}
				/>
				<ToolbarButton
					active={toolbarState.italic}
					label="斜体"
					icon={ItalicIcon}
					onClick={() => dispatchFormat("italic")}
				/>
				<ToolbarButton
					active={toolbarState.strikethrough}
					label="取り消し線"
					icon={StrikethroughIcon}
					onClick={() => dispatchFormat("strikethrough")}
				/>
				<ToolbarButton
					active={toolbarState.inlineCode}
					label="インラインコード"
					icon={CodeIcon}
					onClick={() => dispatchFormat("code")}
				/>
				<span aria-hidden="true" className="bg-kumo-line mx-1 h-5 w-px" />
				<BlockTypeButton
					active={toolbarState.heading === "h2"}
					label="見出し 2"
					icon={Heading2Icon}
					onClick={() => $updateSelectedBlocks(editor, () => $createHeadingNode("h2"))}
				/>
				<BlockTypeButton
					active={toolbarState.heading === "h3"}
					label="見出し 3"
					icon={Heading3Icon}
					onClick={() => $updateSelectedBlocks(editor, () => $createHeadingNode("h3"))}
				/>
				<ToolbarButton
					active={toolbarState.quote}
					label="引用"
					icon={MessageSquareQuoteIcon}
					onClick={() => $updateSelectedBlocks(editor, $createQuoteNode)}
				/>
				<span aria-hidden="true" className="bg-kumo-line mx-1 h-5 w-px" />
				<ToolbarButton
					active={toolbarState.unorderedList}
					label="箇条書き"
					icon={ListIcon}
					onClick={() => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)}
				/>
				<ToolbarButton
					active={toolbarState.orderedList}
					label="番号付きリスト"
					icon={ListOrderedIcon}
					onClick={() => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)}
				/>
				<ToolbarButton
					active={toolbarState.codeBlock}
					label="コードブロック"
					icon={CodeIcon}
					onClick={() => $updateSelectedBlocks(editor, $createCodeNode)}
				/>
				<span aria-hidden="true" className="bg-kumo-line mx-1 h-5 w-px" />
				<LinkToolbarButton active={toolbarState.link} />
				<span aria-hidden="true" className="bg-kumo-line mx-1 h-5 w-px" />
				<ToolbarButton
					label="元に戻す"
					icon={Undo2Icon}
					onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
				/>
				<ToolbarButton
					label="やり直す"
					icon={Redo2Icon}
					onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
				/>
			</div>
		</TooltipProvider>
	);
}
