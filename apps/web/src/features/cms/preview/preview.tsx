import { Banner, Link } from "@cloudflare/kumo";
import { ExternalLinkIcon } from "lucide-react";

import type { NewsContentType } from "@repo/core/types";

import { renderNewsContent } from "./renderer";

interface MarkdownPreviewProps {
	content: string;
	contentType?: NewsContentType;
}

export function MarkdownPreview({ content, contentType = "markdown" }: MarkdownPreviewProps) {
	const renderedContent = renderNewsContent(contentType, content);

	if (renderedContent.contentType === "link") {
		return (
			<Banner
				icon={<ExternalLinkIcon aria-hidden="true" className="size-4 shrink-0" />}
				role="status"
				variant="secondary"
			>
				<Link href={renderedContent.href} rel="noreferrer" target="_blank">
					{renderedContent.href}
				</Link>
			</Banner>
		);
	}

	return (
		<div
			className="prose prose-sm text-kumo-default max-w-none"
			dangerouslySetInnerHTML={{ __html: renderedContent.html }}
		/>
	);
}
