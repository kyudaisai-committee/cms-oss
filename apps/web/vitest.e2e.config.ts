import { existsSync } from "node:fs";
import path from "node:path";

import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const browserProvider = playwright({ launchOptions: { executablePath: findChrome() } });

export default defineConfig({
	cacheDir: path.resolve(import.meta.dirname, "node_modules/.vite-product-consumer"),
	resolve: { dedupe: ["react", "react-dom"] },
	optimizeDeps: {
		entries: [
			"e2e/product-consumer/.product-consumer-*/consumer/.product-consumer-browser-fixture.tsx",
		],
	},
	server: {
		fs: { allow: [path.resolve(import.meta.dirname, "../..")] },
	},
	test: {
		testTimeout: 300_000,
		hookTimeout: 30_000,
		reporters: ["verbose"],
		silent: false,
		projects: [
			{
				test: {
					name: "node",
					environment: "node",
					include: ["e2e/data-import.spec.ts"],
				},
			},
			{
				test: {
					name: "product-consumer-browser",
					include: ["e2e/product-consumer.spec.ts"],
					globalSetup: [path.resolve(import.meta.dirname, "e2e/product-consumer/global-setup.ts")],
					browser: {
						enabled: true,
						headless: true,
						provider: browserProvider,
						instances: [{ browser: "chromium" }],
					},
				},
			},
			{
				test: {
					name: "news-form-browser",
					include: ["e2e/news-form.spec.tsx"],
					browser: {
						enabled: true,
						headless: true,
						provider: browserProvider,
						instances: [{ browser: "chromium" }],
					},
				},
			},
		],
	},
});

function findChrome(): string {
	const candidates = [
		process.env.CHROME_EXECUTABLE_PATH,
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		"/usr/bin/google-chrome",
		"/usr/bin/chromium",
	];
	const chromePath = candidates.find((candidate) => candidate && existsSync(candidate));
	if (chromePath === undefined) {
		throw new Error(
			"Existing Chrome is required; browser binaries are not downloaded by this test.",
		);
	}
	return chromePath;
}
