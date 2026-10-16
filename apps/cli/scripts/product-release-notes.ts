import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { fromMarkdown } from "mdast-util-from-markdown";
import { valid } from "semver";

type MarkdownNode = ReturnType<typeof fromMarkdown>["children"][number];

interface ProductChangelogSource {
	packageName: string;
	relativePath: string;
	archiveName: string;
}

const productChangelogSources: ProductChangelogSource[] = [
	{ packageName: "@repo/cli", relativePath: "apps/cli/CHANGELOG.md", archiveName: "cli.md" },
	{ packageName: "@repo/web", relativePath: "apps/web/CHANGELOG.md", archiveName: "web.md" },
	{ packageName: "@repo/api", relativePath: "packages/api/CHANGELOG.md", archiveName: "api.md" },
	{ packageName: "@repo/core", relativePath: "packages/core/CHANGELOG.md", archiveName: "core.md" },
	{
		packageName: "@repo/editor",
		relativePath: "packages/editor/CHANGELOG.md",
		archiveName: "editor.md",
	},
	{
		packageName: "@repo/config",
		relativePath: "packages/config/CHANGELOG.md",
		archiveName: "config.md",
	},
];

export function collectProductReleaseNotes(version: string, changelogs: readonly string[]): string {
	const sections = new Map<string, { heading: string; bodies: Set<string> }>();

	for (const markdown of changelogs) {
		const nodes = fromMarkdown(markdown).children;
		const releaseIndex = nodes.findIndex(
			(node) => isHeading(node, 2) && nodeText(node) === version,
		);
		if (releaseIndex < 0) continue;

		const releaseEndIndex = nodes.findIndex(
			(node, index) => index > releaseIndex && isHeading(node, 2),
		);
		const releaseEnd =
			releaseEndIndex < 0 ? markdown.length : getOffset(nodes[releaseEndIndex], "start");
		if (releaseEnd === undefined) continue;
		const releaseNodes = nodes.slice(
			releaseIndex + 1,
			releaseEndIndex < 0 ? nodes.length : releaseEndIndex,
		);

		for (let index = 0; index < releaseNodes.length; index += 1) {
			const headingNode = releaseNodes[index];
			if (!headingNode || !isHeading(headingNode, 3)) continue;

			let nextHeadingIndex = index + 1;
			while (
				nextHeadingIndex < releaseNodes.length &&
				!isHeadingAtMost(releaseNodes[nextHeadingIndex], 3)
			) {
				nextHeadingIndex += 1;
			}
			const sectionNodes = releaseNodes.slice(index + 1, nextHeadingIndex);
			if (isDependencyOnlySection(sectionNodes)) continue;

			const headingStart = getOffset(headingNode, "start");
			const bodyStart = getOffset(headingNode, "end");
			const nextHeading = releaseNodes[nextHeadingIndex];
			const sectionEnd = nextHeading ? (getOffset(nextHeading, "start") ?? releaseEnd) : releaseEnd;
			if (headingStart === undefined || bodyStart === undefined) continue;

			const heading = markdown.slice(headingStart, bodyStart).trim();
			const body = markdown.slice(bodyStart, sectionEnd).trim();
			if (!heading || !body) continue;

			const sectionTitle = nodeText(headingNode);
			const section = sections.get(sectionTitle) ?? { heading, bodies: new Set<string>() };
			section.bodies.add(body);
			sections.set(sectionTitle, section);
		}
	}

	return [...sections.values()]
		.map(({ heading, bodies }) => `${heading}\n\n${[...bodies].join("\n\n")}`)
		.join("\n\n")
		.trim();
}

export function collectProductReleaseVersions(markdown: string): string[] {
	const versions = new Set<string>();
	for (const node of fromMarkdown(markdown).children) {
		if (!isHeading(node, 2)) continue;
		const version = nodeText(node);
		if (valid(version) === version) versions.add(version);
	}
	return [...versions];
}

export async function copyProductChangelogs(
	version: string,
	repositoryRoot: string,
	productDirectory: string,
): Promise<void> {
	if (version === "0.0.0") return;
	const sources = await Promise.all(
		productChangelogSources.map(async (source) => {
			const sourcePath = join(repositoryRoot, source.relativePath);
			if (!existsSync(sourcePath)) {
				throw new Error(`Generated Changesets changelog is missing for ${source.packageName}.`);
			}
			return {
				...source,
				markdown: await readFile(sourcePath, "utf8"),
				sourcePath,
			};
		}),
	);
	const releaseNotes = collectProductReleaseNotes(
		version,
		sources.map(({ markdown }) => markdown),
	);
	if (!releaseNotes) {
		throw new Error(`Generated Changesets release notes are missing for ${version}.`);
	}

	const changelogDirectory = join(productDirectory, "changelogs");
	await mkdir(changelogDirectory, { recursive: true });
	await Promise.all(
		sources.map(({ sourcePath, archiveName }) =>
			copyFile(sourcePath, join(changelogDirectory, archiveName)),
		),
	);
}

function isHeading(
	node: MarkdownNode | undefined,
	depth: number,
): node is MarkdownNode & {
	depth: number;
	type: "heading";
} {
	return node?.type === "heading" && node.depth === depth;
}

function isHeadingAtMost(node: MarkdownNode | undefined, depth: number): boolean {
	return node?.type === "heading" && typeof node.depth === "number" && node.depth <= depth;
}

function nodeText(node: MarkdownNode): string {
	if ("value" in node && typeof node.value === "string") return node.value;
	if ("children" in node) return node.children.map(nodeText).join("");
	return "";
}

function getOffset(node: MarkdownNode | undefined, edge: "start" | "end"): number | undefined {
	const offset = node?.position?.[edge].offset;
	return typeof offset === "number" ? offset : undefined;
}

function isDependencyOnlySection(nodes: readonly MarkdownNode[]): boolean {
	if (nodes.length === 0) return false;
	const items: MarkdownNode[] = [];
	for (const node of nodes) {
		if (node.type !== "list" || !("children" in node)) return false;
		items.push(...node.children);
	}
	return (
		items.length > 0 &&
		items.every((item) => nodeText(item).trim().startsWith("Updated dependencies"))
	);
}
