import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import { describe, expect, it } from "vitest";

import { validateConfig } from "@repo/config";

import { createProjectEnvironment } from "./environment.js";
import { resolveProjectPaths } from "./paths.js";

describe("createProjectEnvironment", () => {
	it("exposes only the five display settings and uses consumer persistence paths", async () => {
		const directory = await mkdtemp(join(tmpdir(), "cms-cli-environment-"));
		const previous = new Map<string, string | undefined>([
			["VITE_CMS_NAME", process.env.VITE_CMS_NAME],
			["VITE_PRIVATE_TOKEN", process.env.VITE_PRIVATE_TOKEN],
		]);
		process.env.VITE_CMS_NAME = "stale host value";
		process.env.VITE_PRIVATE_TOKEN = "must not reach the client";

		try {
			const config = validateConfig({
				name: "Consumer Name",
				iconUrl: "https://example.test/cms.svg",
				cloudflare: { accessAudience: "private-audience" },
			});
			const paths = resolveProjectPaths(directory);
			const environment = createProjectEnvironment(config, paths, "production");

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
			expect(environment.CMS_ENVIRONMENT_NAME).toBe("production");
			expect(environment.CMS_WRANGLER_STATE_DIR).toBe(join(directory, ".wrangler", "state"));
			expect(environment.PATH?.split(delimiter)[0]).toBe(
				join(paths.packageRoot, "node_modules", ".bin"),
			);
		} finally {
			for (const [name, value] of previous) {
				if (value === undefined) delete process.env[name];
				else process.env[name] = value;
			}
			await rm(directory, { recursive: true, force: true });
		}
	});
});
