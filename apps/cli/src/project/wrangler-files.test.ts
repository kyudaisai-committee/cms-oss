import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveProjectPaths } from "#cli/project/paths";

import { resolveConsumerWranglerConfig, resolvePluginDeployConfig } from "./wrangler-files.js";

describe("consumer Wrangler configuration", () => {
	it("selects an existing consumer configuration from the project root", async () => {
		const directory = await mkdtemp(join(tmpdir(), "cms-cli-wrangler-config-"));
		const paths = resolveProjectPaths(directory);

		try {
			const configPath = join(directory, "wrangler.jsonc");
			await writeFile(configPath, "{}");

			expect(await resolveConsumerWranglerConfig(paths)).toBe(configPath);
			expect(await resolveConsumerWranglerConfig(paths, "wrangler.jsonc")).toBe(configPath);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("requires the consumer to provide an existing configuration", async () => {
		const directory = await mkdtemp(join(tmpdir(), "cms-cli-wrangler-missing-"));

		try {
			await expect(resolveConsumerWranglerConfig(resolveProjectPaths(directory))).rejects.toThrow(
				"No existing Wrangler configuration was found",
			);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});

describe("plugin deploy configuration", () => {
	it("returns the Worker config produced by the Waku Cloudflare plugin", async () => {
		const directory = await mkdtemp(join(tmpdir(), "cms-cli-plugin-config-"));
		const paths = resolveProjectPaths(directory);
		const deployDirectory = join(paths.cmsDirectory, ".wrangler", "deploy");

		try {
			await mkdir(deployDirectory, { recursive: true });
			await writeFile(
				join(deployDirectory, "config.json"),
				JSON.stringify({ configPath: "worker.json" }),
			);
			const workerConfigPath = join(deployDirectory, "worker.json");
			await writeFile(workerConfigPath, JSON.stringify({ name: "consumer-worker" }));

			expect(await resolvePluginDeployConfig(paths, "consumer-worker")).toBe(workerConfigPath);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("rejects a plugin configuration for a different selected Worker", async () => {
		const directory = await mkdtemp(join(tmpdir(), "cms-cli-plugin-mismatch-"));
		const paths = resolveProjectPaths(directory);
		const deployDirectory = join(paths.cmsDirectory, ".wrangler", "deploy");

		try {
			await mkdir(deployDirectory, { recursive: true });
			await writeFile(
				join(deployDirectory, "config.json"),
				JSON.stringify({ configPath: "worker.json" }),
			);
			await writeFile(
				join(deployDirectory, "worker.json"),
				JSON.stringify({ name: "staging-worker" }),
			);

			await expect(resolvePluginDeployConfig(paths, "production-worker")).rejects.toThrow(
				"different environment",
			);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
