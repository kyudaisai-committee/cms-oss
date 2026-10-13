import type { ParagraphNode, RangeSelection } from "lexical";

import { $reconcileMarkdownParagraph } from "#editor/paragraph/reconcile";
import {
	$getMarkdownBlockRawSource,
	$getMarkdownBlockSelectionSnapshot,
	$replaceMarkdownBlockRawSource,
} from "#editor/shared/block-source";

export function $insertMarkdownLinkSource(
	block: ParagraphNode,
	selection: RangeSelection,
	label: string,
	formattedUrl: string,
) {
	const snapshot = $getMarkdownBlockSelectionSnapshot(selection);
	if (!snapshot || snapshot.block !== block) return false;
	const rawSource = $getMarkdownBlockRawSource(block);
	const start = Math.min(snapshot.anchorOffset, snapshot.focusOffset);
	const end = Math.max(snapshot.anchorOffset, snapshot.focusOffset);
	const linkLabel = start === end ? label : rawSource.slice(start, end);
	const replacement = `[${linkLabel}](${formattedUrl})`;
	const source = rawSource.slice(0, start) + replacement + rawSource.slice(end);
	const anchorOffset = snapshot.isBackward ? start + 1 + linkLabel.length : start + 1;
	const focusOffset = snapshot.isBackward ? start + 1 : start + 1 + linkLabel.length;
	if (start === end) {
		$replaceMarkdownBlockRawSource(
			block,
			selection,
			source,
			start + replacement.length,
			start + replacement.length,
		);
	} else {
		$replaceMarkdownBlockRawSource(block, selection, source, anchorOffset, focusOffset);
	}
	$reconcileMarkdownParagraph(block);
	return true;
}
