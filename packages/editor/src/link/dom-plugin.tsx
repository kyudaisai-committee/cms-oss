import type { LinkNode } from "@lexical/link";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
	$getRoot,
	$getSelection,
	$isRangeSelection,
	type EditorState,
	type LexicalEditor,
	type NodeKey,
} from "lexical";
import { useEffect } from "react";

import { $collectStructuredLinks, $getStructuredLinkRole } from "#editor/link/model";
import { $collectActiveStructuredLinkKeys } from "#editor/link/selection";

function $syncLinkDom(
	editor: LexicalEditor,
	editorState: EditorState,
	previousChildKeys: Set<NodeKey>,
) {
	const currentKeys = new Set<NodeKey>();
	const currentChildKeys = new Set<NodeKey>();
	editorState.read(() => {
		const activeKeys = new Set<NodeKey>();
		const selection = $getSelection();
		if ($isRangeSelection(selection)) $collectActiveStructuredLinkKeys(selection, activeKeys);
		const links: LinkNode[] = [];
		$collectStructuredLinks($getRoot(), links);
		for (const linkNode of links) {
			currentKeys.add(linkNode.getKey());
			const element = editor.getElementByKey(linkNode.getKey());
			if (!element) continue;
			element.setAttribute("data-structured-link", "true");
			if (activeKeys.has(linkNode.getKey())) element.setAttribute("data-active", "true");
			else element.removeAttribute("data-active");
			for (const child of linkNode.getChildren()) {
				currentChildKeys.add(child.getKey());
				const childElement = editor.getElementByKey(child.getKey());
				if (!childElement) continue;
				const role = $getStructuredLinkRole(child);
				if (role) childElement.setAttribute("data-role", role);
				else childElement.removeAttribute("data-role");
			}
		}
	});
	for (const key of previousChildKeys) {
		if (!currentChildKeys.has(key)) editor.getElementByKey(key)?.removeAttribute("data-role");
	}
	return currentKeys;
}

export function StructuredLinkDomPlugin() {
	const [editor] = useLexicalComposerContext();

	useEffect(() => {
		let previousLinkKeys = new Set<NodeKey>();
		let previousChildKeys = new Set<NodeKey>();
		const $sync = (editorState: EditorState) => {
			const currentKeys = $syncLinkDom(editor, editorState, previousChildKeys);
			const currentChildKeys = new Set<NodeKey>();
			editorState.read(() => {
				const links: LinkNode[] = [];
				$collectStructuredLinks($getRoot(), links);
				for (const link of links) {
					for (const child of link.getChildren()) currentChildKeys.add(child.getKey());
				}
			});
			for (const key of previousLinkKeys) {
				if (currentKeys.has(key)) continue;
				const element = editor.getElementByKey(key);
				element?.removeAttribute("data-structured-link");
				element?.removeAttribute("data-active");
			}
			previousLinkKeys = currentKeys;
			previousChildKeys = currentChildKeys;
		};

		const removeUpdateListener = editor.registerUpdateListener(({ editorState }) =>
			$sync(editorState),
		);
		$sync(editor.getEditorState());

		return () => {
			removeUpdateListener();
			for (const key of previousLinkKeys) {
				const element = editor.getElementByKey(key);
				element?.removeAttribute("data-structured-link");
				element?.removeAttribute("data-active");
			}
			for (const key of previousChildKeys) {
				editor.getElementByKey(key)?.removeAttribute("data-role");
			}
		};
	}, [editor]);

	return null;
}
