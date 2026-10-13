import { Text } from "@cloudflare/kumo";
import { CodeExtension } from "@lexical/code";
import { $convertToMarkdownString } from "@lexical/markdown";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { LexicalExtensionComposer } from "@lexical/react/LexicalExtensionComposer";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { defineExtension, type EditorState } from "lexical";
import { useState } from "react";

import { MarkdownCodeBlockShortcutPlugin } from "#editor/code-block/plugin";
import { createEditorConfig } from "#editor/config";
import { HeadingMarkerPlugin } from "#editor/heading/plugin";
import { MarkdownInlineMarkerVisibilityPlugin } from "#editor/inline/visibility-plugin";
import { StructuredLinkDomPlugin } from "#editor/link/dom-plugin";
import { MarkdownParagraphReconcilePlugin } from "#editor/paragraph/plugin";
import { QuoteMarkerPlugin } from "#editor/quote/plugin";
import {
	MARKDOWN_EDITOR_TRANSFORMERS,
	MARKDOWN_SHORTCUT_TRANSFORMERS,
} from "#editor/shared/transformers";
import { cn } from "#editor/shared/utils";
import { MarkdownToolbar } from "#editor/toolbar/toolbar";

import styles from "#editor/editor.module.css";

interface MarkdownEditorProps {
	title: string;
	initialMarkdown?: string;
	onMarkdownChange?: (markdown: string) => void;
	placeholder?: string;
	ariaLabel?: string;
	className?: string;
}

function createMarkdownEditorExtension(initialMarkdown: string) {
	return defineExtension({
		name: "MarkdownEditor",
		dependencies: [CodeExtension],
		...createEditorConfig(initialMarkdown),
	});
}

export function MarkdownEditor({
	title,
	initialMarkdown = "",
	onMarkdownChange,
	placeholder = "Markdown を入力してください…",
	ariaLabel = "Markdown エディター",
	className,
}: MarkdownEditorProps) {
	const [extension] = useState(() => createMarkdownEditorExtension(initialMarkdown));

	const $handleChange = (editorState: EditorState) => {
		if (!onMarkdownChange) return;
		editorState.read(() => {
			onMarkdownChange($convertToMarkdownString(MARKDOWN_EDITOR_TRANSFORMERS));
		});
	};

	return (
		<LexicalExtensionComposer contentEditable={null} extension={extension}>
			<div
				className={cn("overflow-hidden rounded-lg border border-kumo-line bg-kumo-base", className)}
			>
				<MarkdownToolbar />
				<div className="px-4 pt-4 pb-1">
					<Text as="h2" variant="heading" size="lg">
						{title.trim() || (
							<Text as="span" variant="secondary">
								タイトル未設定
							</Text>
						)}
					</Text>
				</div>
				<HeadingMarkerPlugin />
				<QuoteMarkerPlugin />
				<MarkdownParagraphReconcilePlugin />
				<MarkdownInlineMarkerVisibilityPlugin />
				<MarkdownCodeBlockShortcutPlugin />
				<StructuredLinkDomPlugin />
				<div className="relative">
					<RichTextPlugin
						contentEditable={
							<ContentEditable
								aria-label={ariaLabel}
								className={cn(
									"prose prose-sm min-h-64 max-w-none px-4 pt-2 pb-4 text-kumo-default outline-none",
									styles.markdownEditor,
								)}
							/>
						}
						placeholder={
							<Text
								as="span"
								DANGEROUS_className="pointer-events-none absolute top-2 left-4"
								variant="secondary"
							>
								{placeholder}
							</Text>
						}
						ErrorBoundary={LexicalErrorBoundary}
					/>
				</div>
				<HistoryPlugin />
				<ListPlugin />
				<LinkPlugin />
				<MarkdownShortcutPlugin transformers={MARKDOWN_SHORTCUT_TRANSFORMERS} />
				<OnChangePlugin ignoreSelectionChange onChange={$handleChange} />
			</div>
		</LexicalExtensionComposer>
	);
}
