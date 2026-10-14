import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadCmsConfig } from "./config.js";

describe("loadCmsConfig", () => {
	it("loads and validates native Cloudflare settings without a duplicate CMS environment map", async () => {
		const directory = await mkdtemp(join(tmpdir(), "cms-cli-config-"));
		const configPath = join(directory, "cms.config.ts");
		await writeFile(
			configPath,
			[
				"export default {",
				'\tname: "Consumer CMS",',
				'\tcloudflare: { name: "consumer-worker", compatibility_date: "2026-10-14" },',
				"};",
			].join("\n"),
		);

		try {
			const loaded = await loadCmsConfig(configPath, "production");

			expect(loaded.config.name).toBe("Consumer CMS");
			expect(loaded.configDirectory).toBe(directory);
			expect(loaded.environmentName).toBe("production");
			expect(loaded.cloudflare).toEqual({
				name: "consumer-worker",
				compatibility_date: "2026-10-14",
			});
			expect(loaded.wranglerConfigPath).toBeUndefined();
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("keeps a Wrangler config reference as a reference until the CLI selects it", async () => {
		const directory = await mkdtemp(join(tmpdir(), "cms-cli-config-reference-"));
		const configPath = join(directory, "cms.config.ts");
		await writeFile(
			configPath,
			'export default { cloudflare: { configPath: "./wrangler.jsonc" } };\n',
		);

		try {
			const loaded = await loadCmsConfig(configPath);

			expect(loaded.cloudflare).toEqual({ configPath: "./wrangler.jsonc" });
			expect(loaded.wranglerConfigPath).toBeUndefined();
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
