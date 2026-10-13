import type { Locator, Page } from "playwright-core";
import { expect } from "vitest";

import {
	assertComparisonFieldsAligned,
	assertComparisonValueStartsAligned,
} from "./comparison-layout";
import {
	autoJapaneseSummary,
	autoJapaneseTitle,
	manualJapaneseTitle,
	sourceExport,
} from "./fixture";
import { selectOption } from "./settings-controls";

export interface SettingsPreviewControls {
	articleTable: Locator;
	importButton: Locator;
	manualDetailButton: Locator;
}

export async function runSettingsPreview(
	page: Page,
	screenshotDirectory: string,
): Promise<SettingsPreviewControls> {
	const sourceFile = page.getByLabel("JSONファイル", { exact: true });
	try {
		await sourceFile.waitFor({ timeout: 15_000 });
	} catch {
		const fileInputs = await page
			.locator('input[type="file"]')
			.evaluateAll((inputs) =>
				inputs.map((input) =>
					input instanceof HTMLInputElement
						? { ariaLabel: input.getAttribute("aria-label"), labels: input.labels?.length ?? 0 }
						: { tagName: input.tagName },
				),
			);
		throw new Error(
			`Scoped settings route did not render accessible import input: ${(await page.locator("body").innerText()).slice(0, 2000)}; inputs: ${JSON.stringify(fileInputs)}`,
		);
	}
	await sourceFile.setInputFiles({
		name: "scoped-export.json",
		mimeType: "application/json",
		buffer: Buffer.from(JSON.stringify(sourceExport())),
	});
	await selectOption(
		page,
		"読み取る元のスコープデータ",
		"元データ 2: 同名の移行元（2025 · source）",
	);
	const sourceSelect = page.getByLabel("読み取る元のスコープデータ", { exact: true });
	expect(await sourceSelect.innerText()).toMatch(/元データ 2: 同名の移行元（2025 · source）/);
	expect(await sourceSelect.innerText()).not.toMatch(/^\s*1\s*$/);
	const articleTable = page.getByRole("table", { name: "取り込み記事のプレビュー" });
	await articleTable.waitFor();
	expect(await articleTable.getByRole("row").count()).toBe(5);
	expect(await page.getByText("選ばない元データ", { exact: true }).count()).toBe(0);
	const manualDetailButton = articleTable.getByRole("button", {
		name: `${manualJapaneseTitle} の取り込み詳細を開く`,
	});
	const manualRowText = await articleTable
		.getByRole("row")
		.filter({ hasText: "duplicate-manual" })
		.innerText();
	expect(manualRowText).toMatch(/手入力記事の日本語タイトル/);
	expect(manualRowText).toMatch(/ja, en/);
	expect(manualRowText).not.toMatch(/en, ja/);
	const importButton = page.getByRole("button", { name: "この内容を取り込む", exact: true });
	expect(await importButton.isDisabled(), "unresolved duplicates must block commit").toBe(true);

	await selectOption(page, "fr の取り込み方法", "既存言語へ変更");
	await selectOption(page, "fr の変更先言語", "日本語（ja）");
	await page.getByText(/複数の翻訳が同じ取り込み先言語「ja」になります/).waitFor();
	expect(await importButton.isDisabled(), "language mapping collision must block commit").toBe(
		true,
	);
	await selectOption(page, "fr の変更先言語", "英語（en）");
	await selectOption(page, "de の取り込み方法", "利用可能な言語に追加");
	await selectOption(page, "it の取り込み方法", "利用可能な言語に追加");

	const autoDetailButton = page.getByRole("button", {
		name: `${autoJapaneseTitle} の取り込み詳細を開く`,
	});
	await autoDetailButton.focus();
	await page.keyboard.press("Enter");
	const dialog = page.getByRole("dialog");
	await dialog.waitFor();
	expect(
		await page.getByRole("dialog", { name: autoJapaneseTitle }).count(),
		"dialog heading must use the source default language instead of the first exported translation",
	).toBe(1);
	expect(await dialog.getByRole("heading", { name: "翻訳の比較" }).count()).toBeGreaterThan(0);
	expect(await dialog.getByText("既存の自動記事", { exact: true }).count()).toBeGreaterThan(0);
	expect(await dialog.getByText(autoJapaneseTitle, { exact: true }).count()).toBeGreaterThan(0);
	expect(
		await dialog.getByText("Existing English translation", { exact: true }).count(),
	).toBeGreaterThan(0);
	expect(await dialog.getByText("Source French link", { exact: true }).count()).toBeGreaterThan(0);
	expect(
		await dialog.getByRole("link", { name: "https://example.com/source-fr" }).count(),
	).toBeGreaterThan(0);
	expect(await dialog.getByText("元データのタグ名 → 既存タグ名").count()).toBeGreaterThan(0);
	expect(await dialog.getByText(autoJapaneseSummary, { exact: true }).count()).toBeGreaterThan(0);
	const japaneseComparison = dialog.getByRole("region", { name: "jaからjaへの翻訳比較" });
	await assertComparisonFieldsAligned(japaneseComparison);
	await assertComparisonValueStartsAligned(
		japaneseComparison,
		"タイトル",
		"タイトル",
		autoJapaneseTitle,
		"既存の自動記事",
	);
	await assertComparisonValueStartsAligned(
		japaneseComparison,
		"概要",
		"概要",
		autoJapaneseSummary,
		"既存概要 既存の自動記事",
	);
	const comparisonHeadings = await dialog.getByRole("heading").allTextContents();
	expect(
		comparisonHeadings.indexOf("取り込む翻訳: 日本語（ja）"),
		"translation details must show the default translation before retaining the remaining source order",
	).toBeLessThan(comparisonHeadings.indexOf("取り込む翻訳: フランス語（fr）"));
	await selectOption(page, "duplicate-auto の重複時の扱い", "空いている連番で追加");
	await dialog.getByText(/公開予定・公開日時/).waitFor();
	await page.screenshot({
		path: `${screenshotDirectory}/settings-article-comparison.png`,
		fullPage: true,
	});
	await dialog.getByRole("button", { name: "閉じる" }).click();
	return { articleTable, importButton, manualDetailButton };
}
