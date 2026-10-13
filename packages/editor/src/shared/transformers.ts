import { CODE, HEADING, QUOTE, TRANSFORMERS } from "@lexical/markdown";
import type { Transformer } from "@lexical/markdown";

import { MARKDOWN_CODE_FENCE_TRANSFORMER } from "#editor/code-block/plugin";
import { MARKDOWN_HEADING_TRANSFORMER } from "#editor/heading/plugin";
import {
	MARKDOWN_INLINE_FORMAT_MARKER_TRANSFORMER,
	MARKDOWN_INLINE_FORMAT_TRANSFORMERS,
} from "#editor/inline/nodes";
import { STRUCTURED_LINK_TRANSFORMER } from "#editor/link/model";
import { MARKDOWN_QUOTE_TRANSFORMER } from "#editor/quote/plugin";

export const MARKDOWN_EDITOR_TRANSFORMERS: Transformer[] = [
	STRUCTURED_LINK_TRANSFORMER,
	MARKDOWN_INLINE_FORMAT_MARKER_TRANSFORMER,
	...MARKDOWN_INLINE_FORMAT_TRANSFORMERS,
	MARKDOWN_HEADING_TRANSFORMER,
	MARKDOWN_QUOTE_TRANSFORMER,
	MARKDOWN_CODE_FENCE_TRANSFORMER,
	...TRANSFORMERS.filter(
		(transformer) =>
			transformer !== CODE &&
			transformer !== HEADING &&
			transformer !== QUOTE &&
			transformer.type !== "text-format" &&
			transformer.type !== "text-match",
	),
];

export const MARKDOWN_SHORTCUT_TRANSFORMERS: Transformer[] = TRANSFORMERS.filter(
	(transformer) =>
		transformer !== CODE &&
		transformer !== HEADING &&
		transformer !== QUOTE &&
		transformer.type !== "text-format" &&
		transformer.type !== "text-match",
);
