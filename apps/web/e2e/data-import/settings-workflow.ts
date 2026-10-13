import type { Page } from "playwright-core";
import { expect } from "vitest";
import { z } from "zod";

import { adminNewsPageSchema, dataImportRequestSchema } from "@repo/core/types";

import { assertComparisonColumnsStacked } from "./comparison-layout";
import { autoJapaneseTitle, manualJapaneseTitle } from "./fixture";
import {
	createDeferredSignal,
	selectOption,
	waitForServerApproval,
	waitForSignal,
} from "./settings-controls";
import type { SettingsPreviewControls } from "./settings-preview";
import { targetSite, targetYear, verifyImportedTarget } from "./target";

export interface SettingsWorkflowOptions {
	page: Page;
	baseUrl: string;
	databaseDirectory: string;
	screenshotDirectory: string;
	controls: SettingsPreviewControls;
}

function parseNewsPage(responseBody: unknown) {
	const envelope = z.record(z.string(), z.unknown()).parse(responseBody);
	return adminNewsPageSchema.parse(envelope["data"]);
}

export async function runSettingsWorkflow({
	page,
	baseUrl,
	databaseDirectory,
	screenshotDirectory,
	controls,
}: SettingsWorkflowOptions): Promise<void> {
	const { articleTable, importButton, manualDetailButton } = controls;
	const skipPreview = page.waitForResponse((response) => {
		if (!response.url().includes("/import/preview") || !response.ok()) return false;
		const request = dataImportRequestSchema.parse(response.request().postDataJSON());
		return request.newsDecisions.some(
			(decision) => decision.newsIndex === 2 && decision.action === "skip",
		);
	});
	await articleTable
		.getByRole("button", { name: "スキップ記事の元タイトル の取り込み詳細を開く" })
		.click();
	const skipDialog = page.getByRole("dialog");
	await selectOption(page, "duplicate-skip の重複時の扱い", "スキップ");
	await skipPreview;
	await skipDialog.getByRole("button", { name: "閉じる" }).click();
	expect(await page.getByLabel("it の取り込み方法", { exact: true }).count()).toBe(0);
	await page.waitForLoadState("networkidle");

	await manualDetailButton.click();
	const manualDialog = page.getByRole("dialog");
	expect(
		await page.getByRole("dialog", { name: manualJapaneseTitle }).count(),
		"the English-first source must use its Japanese default translation as the dialog title",
	).toBe(1);
	const manualHeadings = await manualDialog.getByRole("heading").allTextContents();
	expect(
		manualHeadings.indexOf("取り込む翻訳: 日本語（ja）"),
		"the source default language must be displayed first while retaining original index mapping",
	).toBeLessThan(manualHeadings.indexOf("取り込む翻訳: 英語（en）"));
	const heldPreviewSeen = createDeferredSignal();
	const heldPreviewGate = createDeferredSignal();
	const latestPreviewSeen = createDeferredSignal();
	const latestPreviewGate = createDeferredSignal();
	let holdNextPreview = true;
	await page.route(`**/api/v1/admin/${targetYear}/${targetSite}/import/preview`, async (route) => {
		if (holdNextPreview) {
			holdNextPreview = false;
			heldPreviewSeen.resolve();
			await heldPreviewGate.promise;
		} else {
			const request = dataImportRequestSchema.parse(route.request().postDataJSON());
			const hasManualSlug = request.newsDecisions.some(
				(decision) =>
					decision.newsIndex === 1 &&
					decision.action === "rename" &&
					decision.mode === "manual" &&
					decision.targetSlug === "duplicate-auto-2",
			);
			if (hasManualSlug) {
				latestPreviewSeen.resolve();
				await latestPreviewGate.promise;
			}
		}
		await route.continue();
	});
	await selectOption(page, "duplicate-manual の重複時の扱い", "変更後slugを入力");
	await waitForSignal(
		heldPreviewSeen.promise,
		"manual mode did not trigger the first real preview request",
	);
	const manualSlug = manualDialog.getByLabel("変更後slug", { exact: true });
	await manualSlug.fill("duplicate-auto-2");
	await manualDialog.getByRole("button", { name: "閉じる" }).click();
	const manualRow = articleTable.getByRole("row").filter({ hasText: "duplicate-manual" });
	const manualRowText = await manualRow.innerText();
	expect(manualRowText, "local planner should show the manual slug immediately").toMatch(
		/duplicate-auto-2/,
	);
	await waitForSignal(
		latestPreviewSeen.promise,
		"manual slug did not trigger the latest real preview request",
	);
	expect(
		await importButton.isDisabled(),
		"the latest local changes remain unapproved while their server validation is held",
	).toBe(true);
	latestPreviewGate.resolve();
	await waitForServerApproval(page, importButton);
	expect(await importButton.isEnabled()).toBe(true);
	heldPreviewGate.resolve();
	await page.waitForLoadState("networkidle");
	await page.waitForTimeout(400);
	expect(
		await importButton.isEnabled(),
		"stale earlier approval must not replace the current one",
	).toBe(true);

	const autoRow = articleTable.getByRole("row").filter({ hasText: "duplicate-auto-3" });
	const autoRowText = await autoRow.innerText();
	expect(autoRowText).toMatch(/duplicate-auto-3/);
	expect(autoRowText).toMatch(/fr → en/);
	const tableText = await articleTable.innerText();
	expect(tableText).toMatch(/連番で追加/);
	expect(tableText).toMatch(/指定slugで追加/);
	expect(tableText).toMatch(/スキップ/);
	await page.screenshot({
		path: `${screenshotDirectory}/settings-mixed-article-actions.png`,
		fullPage: true,
	});
	await page.setViewportSize({ width: 390, height: 844 });
	const scrollRegion = page.getByRole("region", {
		name: "取り込み記事のプレビューを左右にスクロール",
	});
	const scrollDimensions = await scrollRegion.evaluate((element) => ({
		clientWidth: element.clientWidth,
		scrollWidth: element.scrollWidth,
	}));
	expect(
		scrollDimensions.scrollWidth,
		"article table must remain horizontally scrollable at a narrow viewport",
	).toBeGreaterThan(scrollDimensions.clientWidth);
	await page.getByRole("button", { name: `${autoJapaneseTitle} の取り込み詳細を開く` }).click();
	const narrowDialog = page.getByRole("dialog");
	await narrowDialog.waitFor({ state: "visible" });
	const narrowDialogBox = await narrowDialog.boundingBox();
	const narrowViewport = await page.evaluate(() => ({
		width: window.innerWidth,
		height: window.innerHeight,
	}));
	if (!narrowDialogBox)
		throw new Error("the narrow comparison dialog surface must be visible within the viewport");
	expect(
		narrowDialogBox.x >= 0 &&
			narrowDialogBox.x + narrowDialogBox.width <= narrowViewport.width &&
			narrowDialogBox.y < narrowViewport.height &&
			narrowDialogBox.y + narrowDialogBox.height > 0,
		"the narrow comparison dialog surface must be visible within the viewport",
	).toBe(true);
	const narrowJapaneseComparison = narrowDialog.getByRole("region", {
		name: "jaからjaへの翻訳比較",
	});
	await assertComparisonColumnsStacked(narrowJapaneseComparison);
	await page.screenshot({
		path: `${screenshotDirectory}/settings-article-comparison-narrow.png`,
		fullPage: false,
	});
	await selectOption(page, "duplicate-auto の重複時の扱い", "変更後slugを入力");
	const narrowManualSlug = narrowDialog.getByLabel("変更後slug", { exact: true });
	await narrowManualSlug.fill("narrow-test-slug");
	expect(await narrowManualSlug.inputValue()).toBe("narrow-test-slug");
	await selectOption(page, "duplicate-auto の重複時の扱い", "空いている連番で追加");
	await narrowDialog.getByRole("button", { name: "閉じる" }).click();
	await page.setViewportSize({ width: 1440, height: 1400 });
	await waitForServerApproval(page, importButton);

	const beforeImportResponse = await fetch(
		`${baseUrl}/api/v1/admin/${targetYear}/${targetSite}/news?page=1&limit=100`,
	);
	expect(beforeImportResponse.status).toBe(200);
	const beforeImportBody: unknown = await beforeImportResponse.json();
	const beforeImport = parseNewsPage(beforeImportBody);
	expect(beforeImport.items.length).toBe(3);
	await importButton.click();
	await page.getByText(/お知らせ 3件・翻訳 6件・タグ 0件を追加しました/).waitFor();
	await verifyImportedTarget(baseUrl, databaseDirectory);
}
