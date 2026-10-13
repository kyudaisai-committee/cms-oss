import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import type { EditorState, NodeKey } from "lexical";
import { useEffect } from "react";

import { registerMarkdownQuoteCommands } from "#editor/quote/commands";
import { $syncQuoteMarkerDOM } from "#editor/quote/markers";
import { registerMarkdownQuoteReconciler } from "#editor/quote/reconcile";

export { registerMarkdownQuoteCommands } from "#editor/quote/commands";
export { $isQuoteMarker } from "#editor/quote/markers";
export { MARKDOWN_QUOTE_TRANSFORMER } from "#editor/quote/transformer";

export function QuoteMarkerPlugin() {
	const [editor] = useLexicalComposerContext();

	useEffect(() => {
		const markerKeys = new Set<NodeKey>();
		const $syncDOM = (editorState: EditorState) => {
			$syncQuoteMarkerDOM(editor, editorState, markerKeys);
		};
		const removeQuoteReconciler = registerMarkdownQuoteReconciler(editor);
		const removeQuoteCommands = registerMarkdownQuoteCommands(editor);
		const removeUpdateListener = editor.registerUpdateListener(({ editorState }) => {
			$syncDOM(editorState);
		});
		$syncDOM(editor.getEditorState());

		return () => {
			removeQuoteReconciler();
			removeQuoteCommands();
			removeUpdateListener();
			for (const key of markerKeys) {
				const element = editor.getElementByKey(key);
				element?.removeAttribute("data-markdown-quote-marker");
				element?.removeAttribute("data-markdown-quote-marker-active");
			}
		};
	}, [editor]);

	return null;
}
