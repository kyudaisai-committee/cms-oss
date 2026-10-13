import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadCmsConfig } from "./config.js";

describe("loadCmsConfig", () => {
	it("loads a TypeScript config and selects the requested Cloudflare environment", async () => {
		const directory = await mkdtemp(join(tmpdir(), "cms-cli-config-"));
		const configPath = join(directory, "cms.config.ts");
		await writeFile(
			configPath,
			[
				"export default {",
				'\tname: "Consumer CMS",',
				'\tcloudflare: { workerName: "consumer-local" },',
				'\tenvironments: { production: { cloudflare: { workerName: "consumer-prod" } } },',
				"};",
			].join("\n"),
		);

		try {
			const loaded = await loadCmsConfig(configPath, "production");

			expect(loaded.config.name).toBe("Consumer CMS");
			expect(loaded.configDirectory).toBe(directory);
			expect(loaded.environmentName).toBe("production");
			expect(loaded.cloudflare.workerName).toBe("consumer-prod");
			expect(loaded.cloudflare.databaseName).toBe("cms-local");
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("rejects an environment that is not declared by the consumer", async () => {
		const directory = await mkdtemp(join(tmpdir(), "cms-cli-config-"));
		const configPath = join(directory, "cms.config.ts");
		await writeFile(configPath, "export default {};\n");

		try {
			await expect(loadCmsConfig(configPath, "staging")).rejects.toThrow(
				'Unknown Cloudflare environment "staging"',
			);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
