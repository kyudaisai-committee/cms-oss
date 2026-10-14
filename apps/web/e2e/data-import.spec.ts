import { chromium } from "playwright-core";
import type { Page } from "playwright-core";
import { describe, expect, it } from "vitest";

import { createIsolatedEnvironment } from "./data-import/environment";
import { runSettingsPreview } from "./data-import/settings-preview";
import { runSettingsWorkflow } from "./data-import/settings-workflow";
import { seedTarget, targetSite, targetYear } from "./data-import/target";

describe("isolated settings import E2E", () => {
	it("previews a selected source and commits only the resolved import through isolated D1", async () => {
		await using environment = await createIsolatedEnvironment();
		await seedTarget(environment.baseUrl);
		await using browser = await chromium.launch({
			headless: true,
			executablePath: environment.chromePath,
		});
		await using context = await browser.newContext({
			acceptDownloads: false,
			viewport: { width: 1440, height: 1400 },
		});
		const page = await context.newPage();
		const pageErrors: Error[] = [];
		const consoleErrors: { message: string; url: string }[] = [];
		const failedResponses: { status: number; url: string }[] = [];
		let unexpectedDownload = false;
		attachBrowserChecks(page, pageErrors, consoleErrors, failedResponses, () => {
			unexpectedDownload = true;
		});

		const settingsResponse = await page.goto(
			`${environment.baseUrl}/${targetYear}/${targetSite}/settings`,
		);
		if (!settingsResponse) throw new Error("the scoped settings route must load over HTTP");
		expect(settingsResponse.status()).toBe(200);
		const controls = await runSettingsPreview(page, environment.screenshotDirectory);
		await runSettingsWorkflow({
			page,
			baseUrl: environment.baseUrl,
			databaseDirectory: environment.databaseDirectory,
			screenshotDirectory: environment.screenshotDirectory,
			controls,
		});
		expect(unexpectedDownload, "E2E must not trigger export downloads").toBe(false);
		expect(pageErrors, "real settings route must not produce browser errors").toEqual([]);
		expect(
			consoleErrors.filter((error) => !isOptionalFaviconUrl(error.url)),
			"real settings route must not log browser console errors",
		).toEqual([]);
		expect(
			failedResponses.filter((response) => !isOptionalFaviconUrl(response.url)),
			"real settings route must not load failing resources",
		).toEqual([]);
		console.info(`Import E2E screenshots: ${environment.screenshotDirectory}`);
	}, 300_000);
});

function attachBrowserChecks(
	page: Page,
	pageErrors: Error[],
	consoleErrors: { message: string; url: string }[],
	failedResponses: { status: number; url: string }[],
	onDownload: () => void,
): void {
	page.on("download", onDownload);
	page.on("pageerror", (error) => pageErrors.push(error));
	page.on("console", (message) => {
		if (message.type() !== "error") return;
		const location = message.location();
		consoleErrors.push({ message: message.text(), url: location.url });
	});
	page.on("response", (response) => {
		if (response.status() >= 400)
			failedResponses.push({ status: response.status(), url: response.url() });
	});
}

function isOptionalFaviconUrl(url: string): boolean {
	try {
		return new URL(url).pathname === "/favicon.ico";
	} catch {
		return false;
	}
}
