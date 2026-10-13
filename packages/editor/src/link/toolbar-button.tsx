import { Button, Input, Label, Popover } from "@cloudflare/kumo";
import { formatUrl } from "@lexical/link";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
	$getSelection,
	$isParagraphNode,
	$isRangeSelection,
	$setSelection,
	type RangeSelection,
} from "lexical";
import { LinkIcon, PlusIcon, XIcon } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";

import { $setStructuredLinkUrl } from "#editor/link/model";
import { $findLinkNodeFromSelection } from "#editor/link/selection";
import { $insertMarkdownLinkSource } from "#editor/link/source";
import { $reconcileMarkdownParagraph } from "#editor/paragraph/reconcile";
import { $getMarkdownBlockSelectionSnapshot } from "#editor/shared/block-source";

interface LinkToolbarButtonProps {
	active?: boolean;
}

export function LinkToolbarButton({ active }: LinkToolbarButtonProps) {
	const [editor] = useLexicalComposerContext();
	const [open, setOpen] = useState(false);
	const [url, setUrl] = useState("");
	const inputId = useId();
	const selectionRef = useRef<RangeSelection | null>(null);

	const $captureSelection = () => {
		editor.getEditorState().read(() => {
			const selection = $getSelection();
			if (!$isRangeSelection(selection)) {
				selectionRef.current = null;
				setUrl("");
				return;
			}
			selectionRef.current = selection.clone();
			const linkNode = $findLinkNodeFromSelection(selection);
			setUrl(linkNode?.getURL() ?? "");
		});
	};

	const handleOpenChange = (nextOpen: boolean) => {
		setOpen(nextOpen);
		if (!nextOpen) {
			setUrl("");
			selectionRef.current = null;
		}
	};

	const $handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
		if (event.key === "Enter" || event.key === " ") $captureSelection();
	};

	const $applyLink = () => {
		const trimmedUrl = url.trim();
		const selection = selectionRef.current;
		if (!trimmedUrl || !selection) return;
		const formattedUrl = formatUrl(trimmedUrl);

		editor.update(() => {
			$setSelection(selection.clone());
			const currentSelection = $getSelection();
			if (!$isRangeSelection(currentSelection)) return;
			const selectedBlock = $getMarkdownBlockSelectionSnapshot(currentSelection)?.block;
			if (!$isParagraphNode(selectedBlock)) return;

			const activeLink = $findLinkNodeFromSelection(currentSelection);
			if (activeLink) {
				$setStructuredLinkUrl(activeLink, formattedUrl);
				$reconcileMarkdownParagraph(selectedBlock);
				return;
			}

			$insertMarkdownLinkSource(selectedBlock, currentSelection, trimmedUrl, formattedUrl);
		});
		handleOpenChange(false);
	};

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<Popover.Trigger
				onKeyDown={$handleTriggerKeyDown}
				onPointerDown={$captureSelection}
				render={
					<Button
						aria-label="リンクを挿入"
						aria-pressed={active}
						size="sm"
						title="リンクを挿入"
						type="button"
						variant={active ? "secondary" : "ghost"}
					>
						<LinkIcon aria-hidden="true" className="size-4" />
					</Button>
				}
			/>
			<Popover.Content align="start" className="grid gap-3">
				<div className="flex flex-col gap-1">
					<Popover.Title>リンクを挿入</Popover.Title>
					<Popover.Description>選択範囲、または入力したURLをリンクにします。</Popover.Description>
				</div>
				<div className="flex flex-col gap-2">
					<Label htmlFor={inputId}>URL</Label>
					<Input
						autoFocus
						aria-label="リンクURL"
						id={inputId}
						onChange={(event) => setUrl(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								$applyLink();
							}
						}}
						placeholder="https://example.com"
						value={url}
					/>
				</div>
				<div className="flex justify-end gap-2">
					<Button onClick={() => handleOpenChange(false)} size="sm" type="button" variant="outline">
						<XIcon aria-hidden="true" className="size-3.5" />
						キャンセル
					</Button>
					<Button
						disabled={!url.trim()}
						onClick={$applyLink}
						size="sm"
						type="button"
						variant="primary"
					>
						<PlusIcon aria-hidden="true" className="size-3.5" />
						追加
					</Button>
				</div>
			</Popover.Content>
		</Popover>
	);
}
