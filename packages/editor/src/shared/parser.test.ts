import { describe, expect, it } from "vitest";

import { parseMarkdown } from "#editor/shared/parser";

describe("parseMarkdown", () => {
	it("parses inline markdown and preserves source positions", () => {
		const root = parseMarkdown("before **** after **x** *y* ~~z~~ `code` [link](url)");
		const paragraph = root.children[0];

		expect(paragraph?.type).toBe("paragraph");
		if (paragraph?.type !== "paragraph") return;
		expect(paragraph.children.map((child) => child.type)).toEqual([
			"text",
			"strong",
			"text",
			"emphasis",
			"text",
			"delete",
			"text",
			"inlineCode",
			"text",
			"link",
		]);
		expect(paragraph.children[0]?.type).toBe("text");
		if (paragraph.children[0]?.type === "text") {
			expect(paragraph.children[0].value).toContain("****");
		}
		for (const child of paragraph.children) {
			expect(child.position?.start.offset).toEqual(expect.any(Number));
			expect(child.position?.end.offset).toEqual(expect.any(Number));
		}
	});

	it("parses headings, quotes, fenced code, and lists with offsets", () => {
		const source =
			"# heading\n\n> quote\n\n```ts\ncode\n```\n\n- one\n- two\n\n1. first\n2. second";
		const root = parseMarkdown(source);

		expect(root.children.map((child) => child.type)).toEqual([
			"heading",
			"blockquote",
			"code",
			"list",
			"list",
		]);
		for (const child of root.children) {
			expect(child.position?.start.offset).toEqual(expect.any(Number));
			expect(child.position?.end.offset).toEqual(expect.any(Number));
		}
		const heading = root.children[0];
		if (heading?.type === "heading") expect(heading.depth).toBe(1);
		const code = root.children[2];
		if (code?.type === "code") {
			expect(code.lang).toBe("ts");
			expect(code.value).toBe("code");
		}
		const unordered = root.children[3];
		if (unordered?.type === "list") {
			expect(unordered.ordered).toBe(false);
			expect(unordered.children).toHaveLength(2);
		}
		const ordered = root.children[4];
		if (ordered?.type === "list") {
			expect(ordered.ordered).toBe(true);
			expect(ordered.start).toBe(1);
		}
	});
});
