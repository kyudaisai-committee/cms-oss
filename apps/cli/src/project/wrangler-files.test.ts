import { mkdtempDisposable, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { unstable_readConfig } from "wrangler";

import { resolveProjectPaths } from "#cli/project/paths";
import { validateConfig } from "@repo/config";

import {
	assertWranglerEnvironmentExists,
	findConsumerWranglerConfig,
	resolveConsumerWranglerConfig,
	resolvePluginDeployConfig,
} from "./wrangler-files.js";

describe("consumer Wrangler configuration", () => {
	it("selects an existing consumer configuration from the project root", async () => {
		await using directory = await mkdtempDisposable(join(tmpdir(), "cms-cli-wrangler-config-"));
		const paths = resolveProjectPaths(directory.path);

		const configPath = join(directory.path, "wrangler.jsonc");
		await writeFile(configPath, "{}");

		expect(await resolveConsumerWranglerConfig(paths)).toBe(configPath);
		expect(await resolveConsumerWranglerConfig(paths, "wrangler.jsonc")).toBe(configPath);
	});

	it("requires the consumer to provide an existing configuration", async () => {
		await using directory = await mkdtempDisposable(join(tmpdir(), "cms-cli-wrangler-missing-"));
		await expect(
			resolveConsumerWranglerConfig(resolveProjectPaths(directory.path)),
		).rejects.toThrow("No existing Wrangler configuration was found");
	});

	it("allows direct settings without a Wrangler file but finds an existing file when present", async () => {
		await using temporaryDirectory = await mkdtempDisposable(
			join(tmpdir(), "cms-cli-optional-wrangler-config-"),
		);
		const paths = resolveProjectPaths(temporaryDirectory.path);
		const directConfig = validateConfig({ cloudflare: { name: "consumer" } }).cloudflare;

		expect(await findConsumerWranglerConfig(paths, undefined, directConfig)).toBeUndefined();
		const configPath = join(temporaryDirectory.path, "wrangler.jsonc");
		await writeFile(configPath, "{}");
		expect(await findConsumerWranglerConfig(paths, undefined, directConfig)).toBe(configPath);
	});

	it("uses a referenced config by default and gives --wrangler-config priority", async () => {
		await using directory = await mkdtempDisposable(join(tmpdir(), "cms-cli-wrangler-reference-"));
		const paths = resolveProjectPaths(directory.path);
		const referencedPath = join(directory.path, "wrangler.shared.jsonc");
		const overridePath = join(directory.path, "wrangler.override.jsonc");

		await writeFile(referencedPath, "{}");
		await writeFile(overridePath, "{}");
		const config = validateConfig({ cloudflare: { configPath: "./wrangler.shared.jsonc" } });

		expect(await resolveConsumerWranglerConfig(paths, undefined, config.cloudflare)).toBe(
			referencedPath,
		);
		expect(
			await resolveConsumerWranglerConfig(paths, "wrangler.override.jsonc", config.cloudflare),
		).toBe(overridePath);
	});

	it("resolves Wrangler selections relative to a nested cms.config.ts directory", async () => {
		await using temporaryDirectory = await mkdtempDisposable(
			join(tmpdir(), "cms-cli-nested-wrangler-config-"),
		);
		const cwd = temporaryDirectory.path;
		const configDirectory = join(cwd, "projects", "consumer");
		await mkdir(configDirectory, { recursive: true });
		const paths = resolveProjectPaths(cwd, "projects/consumer/cms.config.ts");
		const referencePath = join(configDirectory, "wrangler.reference.jsonc");
		const overridePath = join(configDirectory, "wrangler.override.jsonc");
		const cwdOverridePath = join(cwd, "wrangler.override.jsonc");
		await writeFile(referencePath, "{}");
		await writeFile(overridePath, "{}");
		await writeFile(cwdOverridePath, "{}");
		const config = validateConfig({
			cloudflare: { configPath: "./wrangler.reference.jsonc" },
		});

		expect(await resolveConsumerWranglerConfig(paths, undefined, config.cloudflare)).toBe(
			referencePath,
		);
		expect(
			await resolveConsumerWranglerConfig(paths, "wrangler.override.jsonc", config.cloudflare),
		).toBe(overridePath);
	});

	it("rejects an unknown Wrangler env even though the official reader can normalize it", async () => {
		await using directory = await mkdtempDisposable(
			join(tmpdir(), "cms-cli-wrangler-unknown-env-"),
		);
		const configPath = join(directory.path, "wrangler.jsonc");
		await writeFile(
			configPath,
			JSON.stringify({ name: "root-worker", compatibility_date: "2026-10-14" }),
		);
		const officialConfig = unstable_readConfig(
			{ config: configPath, env: "missing" },
			{ hideWarnings: true },
		);
		expect(officialConfig.name).toBe("root-worker-missing");
		expect(() => assertWranglerEnvironmentExists(configPath, "missing")).toThrow(
			'Cloudflare environment "missing" is not defined',
		);

		await writeFile(
			configPath,
			JSON.stringify({
				name: "root-worker",
				compatibility_date: "2026-10-14",
				env: { production: { name: "production-worker" } },
			}),
		);
		expect(() => assertWranglerEnvironmentExists(configPath, "production")).not.toThrow();
	});
});

describe("plugin deploy configuration", () => {
	it("returns the Worker config produced by the Waku Cloudflare plugin", async () => {
		await using directory = await mkdtempDisposable(join(tmpdir(), "cms-cli-plugin-config-"));
		const paths = resolveProjectPaths(directory.path);
		const deployDirectory = join(paths.cmsDirectory, ".wrangler", "deploy");

		await mkdir(deployDirectory, { recursive: true });
		await writeFile(
			join(deployDirectory, "config.json"),
			JSON.stringify({ configPath: "worker.json" }),
		);
		const workerConfigPath = join(deployDirectory, "worker.json");
		await writeFile(workerConfigPath, JSON.stringify({ name: "consumer-worker" }));

		expect(await resolvePluginDeployConfig(paths, "consumer-worker")).toBe(workerConfigPath);
	});

	it("rejects a plugin configuration for a different selected Worker", async () => {
		await using directory = await mkdtempDisposable(join(tmpdir(), "cms-cli-plugin-mismatch-"));
		const paths = resolveProjectPaths(directory.path);
		const deployDirectory = join(paths.cmsDirectory, ".wrangler", "deploy");

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
	});
});
