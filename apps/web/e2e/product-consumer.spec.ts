import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, inject, it } from "vitest";
import { page } from "vitest/browser";

const assets = inject("productConsumerAssets");

it("applies generated development and production CSS to the packed Kumo and editor packages", async () => {
	const components = (await import(/* @vite-ignore */ assets.browserEntry)) as Pick<
		typeof import("@cloudflare/kumo"),
		"Button"
	> &
		Pick<typeof import("@repo/editor"), "MarkdownEditor">;
	document.documentElement.dataset.theme = "kumo";
	document.documentElement.dataset.mode = "light";

	for (const stylesheet of [assets.developmentCss, assets.productionCss]) {
		const style = document.createElement("style");
		style.textContent = stylesheet;
		document.head.appendChild(style);
		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);
		try {
			root.render(
				createElement(
					"main",
					null,
					createElement(components.Button, { variant: "primary" }, "Fixture action"),
					createElement(components.MarkdownEditor, {
						title: "Fixture editor",
						ariaLabel: "Fixture editor input",
						initialMarkdown: "Fixture content",
					}),
				),
			);

			const buttonLocator = page.getByRole("button", { name: "Fixture action" });
			await expect.element(buttonLocator).toBeVisible();
			const button = await buttonLocator.findElement();
			const buttonStyle = getComputedStyle(button);
			expect(buttonStyle.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
			expect(buttonStyle.boxShadow).not.toBe("none");
			expect(button.getBoundingClientRect().height).toBeGreaterThan(lineHeight(buttonStyle));

			const editorLocator = page.getByRole("textbox", { name: "Fixture editor input" });
			await expect.element(editorLocator).toBeVisible();
			const editorInput = await editorLocator.findElement();
			const editorStyle = getComputedStyle(editorInput);
			expect(Number.parseFloat(editorStyle.minHeight)).toBeGreaterThan(lineHeight(editorStyle));
		} finally {
			root.unmount();
			container.remove();
			style.remove();
		}
	}
}, 300_000);

function lineHeight(style: CSSStyleDeclaration): number {
	const lineHeight = Number.parseFloat(style.lineHeight);
	return Number.isFinite(lineHeight) ? lineHeight : Number.parseFloat(style.fontSize);
}
