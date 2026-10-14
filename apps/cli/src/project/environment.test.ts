import { mkdtempDisposable } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import { describe, expect, it } from "vitest";

import { validateConfig } from "@repo/config";

import { createProjectEnvironment } from "./environment.js";
import { resolveProjectPaths } from "./paths.js";

describe("createProjectEnvironment", () => {
	it("exposes only the five display settings and uses consumer persistence paths", async () => {
		await using temporaryDirectory = await mkdtempDisposable(
			join(tmpdir(), "cms-cli-environment-"),
		);
		const previous = new Map<string, string | undefined>([
			["VITE_CMS_NAME", process.env.VITE_CMS_NAME],
			["VITE_PRIVATE_TOKEN", process.env.VITE_PRIVATE_TOKEN],
			["CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH", process.env.CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH],
		]);
		process.env.VITE_CMS_NAME = "stale host value";
		process.env.VITE_PRIVATE_TOKEN = "must not reach the client";
		process.env.CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH = "stale-wrangler.jsonc";

		try {
			const config = validateConfig({
				name: "Consumer Name",
				iconUrl: "https://example.test/cms.svg",
				cloudflare: { name: "consumer-cms", vars: { ACCESS_AUDIENCE: "private-audience" } },
			});
			const paths = resolveProjectPaths(temporaryDirectory.path);
			const environment = createProjectEnvironment(
				{
					config,
					configDirectory: temporaryDirectory.path,
					cloudflare: config.cloudflare,
					environmentName: "production",
					wranglerConfigPath: join(temporaryDirectory.path, "wrangler.jsonc"),
				},
				paths,
			);

			expect(
				Object.keys(environment)
					.filter((name) => name.startsWith("VITE_"))
					.sort(),
			).toEqual([
				"VITE_CMS_DESCRIPTION",
				"VITE_CMS_ICON_URL",
				"VITE_CMS_NAME",
				"VITE_CMS_NEWS_FORM_STORAGE_PREFIX",
				"VITE_CMS_THEME_STORAGE_KEY",
			]);
			expect(environment.VITE_CMS_NAME).toBe("Consumer Name");
			expect(environment.VITE_CMS_ICON_URL).toBe("https://example.test/cms.svg");
			expect(environment.VITE_PRIVATE_TOKEN).toBeUndefined();
			expect(environment.ACCESS_AUDIENCE).toBeUndefined();
			expect(environment.CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH).toBe(
				join(temporaryDirectory.path, "wrangler.jsonc"),
			);
			expect(environment.CLOUDFLARE_ENV).toBe("production");
			expect(environment.CMS_RUNTIME_CONFIG).toBe(
				JSON.stringify({
					config,
					wranglerConfigPath: join(temporaryDirectory.path, "wrangler.jsonc"),
				}),
			);
			expect(environment.CMS_WRANGLER_STATE_DIR).toBe(
				join(temporaryDirectory.path, ".wrangler", "state"),
			);
			expect(environment.PATH?.split(delimiter)[0]).toBe(
				join(paths.packageRoot, "node_modules", ".bin"),
			);
			expect(
				createProjectEnvironment(
					{
						config,
						configDirectory: temporaryDirectory.path,
						cloudflare: config.cloudflare,
						environmentName: undefined,
						wranglerConfigPath: undefined,
					},
					paths,
				).CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH,
			).toBeUndefined();
		} finally {
			for (const [name, value] of previous) {
				if (value === undefined) delete process.env[name];
				else process.env[name] = value;
			}
		}
	});
});
