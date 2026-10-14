import type { Locator, Page } from "playwright-core";

export async function selectOption(page: Page, label: string, optionLabel: string): Promise<void> {
	const select = page.getByLabel(label, { exact: true });
	await select.click();
	await page.getByRole("option", { name: optionLabel, exact: true }).click();
}

export async function waitForServerApproval(page: Page, importButton: Locator): Promise<void> {
	await importButton.waitFor({ state: "visible" });
	const deadline = Date.now() + 15_000;
	while (Date.now() < deadline) {
		if (await importButton.isEnabled()) return;
		await page.waitForTimeout(150);
	}
	throw new Error("最新のサーバーpreview tokenでimport buttonが有効になりませんでした。");
}

export interface DeferredSignal {
	promise: Promise<void>;
	resolve: () => void;
}

export function createDeferredSignal(): DeferredSignal {
	let resolvePromise: (() => void) | undefined;
	const promise = new Promise<void>((resolve) => {
		resolvePromise = resolve;
	});
	return { promise, resolve: () => resolvePromise?.() };
}

export async function waitForSignal(signal: Promise<unknown>, message: string): Promise<unknown> {
	const timeoutError = Promise.withResolvers<never>();
	using _timeout = setTimeout(() => timeoutError.reject(new Error(message)), 15_000);
	return await Promise.race([signal, timeoutError.promise]);
}
