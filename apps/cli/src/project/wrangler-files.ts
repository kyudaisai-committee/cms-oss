import { readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

import type { ProjectPaths } from "#cli/project/paths";

const consumerConfigNames = ["wrangler.json", "wrangler.jsonc", "wrangler.toml"] as const;

export async function resolveConsumerWranglerConfig(
	paths: ProjectPaths,
	configArgument?: string,
): Promise<string> {
	if (configArgument !== undefined) {
		const configPath = isAbsolute(configArgument)
			? configArgument
			: resolve(paths.projectRoot, configArgument);
		if (await isFile(configPath)) return configPath;
		throw new Error(`Wrangler configuration does not exist: ${configPath}`);
	}

	for (const name of consumerConfigNames) {
		const configPath = join(paths.projectRoot, name);
		if (await isFile(configPath)) return configPath;
	}

	throw new Error(
		`No existing Wrangler configuration was found in ${paths.projectRoot}. Add a wrangler.json, wrangler.jsonc, or wrangler.toml, or select one with --wrangler-config.`,
	);
}

export async function resolvePluginDeployConfig(
	paths: ProjectPaths,
	expectedWorkerName: string,
): Promise<string> {
	const deployConfigPath = join(paths.cmsDirectory, ".wrangler", "deploy", "config.json");
	let source: string;
	try {
		source = await readFile(deployConfigPath, "utf8");
	} catch (error) {
		throw new Error(
			"The Cloudflare Vite plugin deploy configuration is missing or invalid. Run cms build before deploying.",
			{
				cause: error,
			},
		);
	}
	let deployConfig: unknown;
	try {
		deployConfig = JSON.parse(source);
	} catch (error) {
		throw new Error(
			"The Cloudflare Vite plugin deploy configuration is invalid. Run cms build before deploying.",
			{
				cause: error,
			},
		);
	}

	if (
		!isRecord(deployConfig) ||
		typeof deployConfig.configPath !== "string" ||
		deployConfig.configPath.length === 0
	) {
		throw new Error(
			"The Cloudflare Vite plugin did not provide a deployable Worker configuration. Run cms build again.",
		);
	}

	const configPath = resolve(dirname(deployConfigPath), deployConfig.configPath);
	let configSource: string;
	try {
		configSource = await readFile(configPath, "utf8");
	} catch (error) {
		throw new Error(`The Cloudflare Vite plugin Worker configuration is missing: ${configPath}`, {
			cause: error,
		});
	}
	let workerConfig: unknown;
	try {
		workerConfig = JSON.parse(configSource);
	} catch (error) {
		throw new Error(`The Cloudflare Vite plugin Worker configuration is invalid: ${configPath}`, {
			cause: error,
		});
	}
	if (!isRecord(workerConfig) || workerConfig.name !== expectedWorkerName) {
		throw new Error(
			`The Cloudflare Vite plugin generated Worker configuration for a different environment. Expected worker "${expectedWorkerName}". Run cms build again before deploying.`,
		);
	}
	return configPath;
}

async function isFile(path: string): Promise<boolean> {
	try {
		return (await stat(path)).isFile();
	} catch (error) {
		if (hasErrorCode(error, "ENOENT") || hasErrorCode(error, "ENOTDIR")) return false;
		throw error;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasErrorCode(error: unknown, code: string): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
