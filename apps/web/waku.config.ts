import { realpathSync } from "node:fs";
import { findPackageJSON } from "node:module";
import { dirname, join, resolve } from "node:path";

import { cloudflare, type WorkerConfig } from "@cloudflare/vite-plugin";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "waku/config";

import {
	CMS_BINDINGS,
	isCloudflareConfigReference,
	validateConfig,
	type CmsCloudflareConfig,
	type CmsCloudflareWorkerConfig,
	type CmsConfig,
} from "@repo/config";

export interface CmsRuntimeConfigData {
	config: CmsConfig;
	wranglerConfigPath: string | undefined;
}

export function readCmsRuntimeConfig(
	environment: Record<string, string | undefined> = process.env,
): CmsRuntimeConfigData | undefined {
	const serialized = environment.CMS_RUNTIME_CONFIG;
	if (serialized === undefined) return undefined;

	let value: unknown;
	try {
		value = JSON.parse(serialized);
	} catch (error) {
		throw new Error("The CLI-provided CMS runtime configuration is not valid JSON.", {
			cause: error,
		});
	}
	if (!isRecord(value) || !("config" in value)) {
		throw new Error("The CLI-provided CMS runtime configuration has an invalid shape.");
	}
	if (value.wranglerConfigPath !== undefined && typeof value.wranglerConfigPath !== "string") {
		throw new Error("The CLI-provided Wrangler configuration path must be a string.");
	}
	return {
		config: validateConfig(value.config),
		wranglerConfigPath: value.wranglerConfigPath,
	};
}

export function createCmsWakuConfig(config?: CmsConfig, wranglerConfigPath?: string) {
	const cloudflareConfig = config?.cloudflare;
	const configPathIsReference =
		cloudflareConfig !== undefined && isCloudflareConfigReference(cloudflareConfig);
	const pluginConfigPath = wranglerConfigPath;
	if (configPathIsReference && pluginConfigPath === undefined) {
		throw new Error("A selected Wrangler config path is required for cloudflare.configPath.");
	}
	const workerConfig = config
		? (resolvedConfig: WorkerConfig) => {
				Object.assign(resolvedConfig, resolveCmsWorkerConfig(resolvedConfig, cloudflareConfig));
			}
		: undefined;
	const persistencePath =
		process.env.CMS_E2E_WRANGLER_STATE_DIR ?? process.env.CMS_WRANGLER_STATE_DIR;
	return defineConfig({
		unstable_adapter: "waku/adapters/cloudflare",
		vite: {
			resolve: { dedupe: ["react", "react-dom", "react-server-dom-webpack"] },
			server: {
				watch: {
					ignored: /[\\/]\.wrangler[\\/]/,
				},
				allowedHosts: config?.devServer.allowedHosts ?? [],
			},
			plugins: [
				cloudflare({
					...(pluginConfigPath ? { configPath: pluginConfigPath } : {}),
					...(workerConfig ? { config: workerConfig } : {}),
					viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
					persistState: persistencePath ? { path: persistencePath } : true,
					inspectorPort: false,
					remoteBindings: false,
				}),
				tailwindPackageSourcesPlugin(),
				tailwindcss(),
				react(),
				babel({ presets: [reactCompilerPreset()] }),
			],
			environments: {
				client: {
					optimizeDeps: { exclude: ["lucide-react"] },
				},
				rsc: {
					optimizeDeps: { exclude: ["lucide-react"] },
					build: { rolldownOptions: { platform: "neutral" } },
				},
				ssr: {
					build: { rolldownOptions: { platform: "neutral" } },
				},
			},
		},
	});
}

function tailwindPackageSourcesPlugin() {
	const packageManifest = join(process.cwd(), "package.json");
	const editorPackage = findPackageDirectory("@repo/editor", packageManifest);
	const kumoPackage = findPackageDirectory("@cloudflare/kumo", packageManifest);
	const sourceDirectives = [
		formatTailwindSource(join(editorPackage, "src/**/*.{ts,tsx}")),
		formatTailwindSource(join(kumoPackage, "dist/**/*.{js,jsx,ts,tsx}")),
	].join("\n");

	return {
		name: "cms-tailwind-package-sources",
		enforce: "pre" as const,
		transform(code: string, id: string) {
			const sourceId = id.replace(/\?.*$/, "");
			if (!sourceId.endsWith("/styles.css")) return null;
			return code.replace("/* @cms-tailwind-package-sources */", sourceDirectives);
		},
	};
}

function findPackageDirectory(packageName: string, base: string): string {
	const packageManifest = findPackageJSON(packageName, base);
	if (packageManifest === undefined) {
		throw new Error(`Required Tailwind source package is not installed: ${packageName}`);
	}
	return dirname(realpathSync(packageManifest));
}

function formatTailwindSource(source: string): string {
	return `@source "${source.replaceAll("\\", "/").replaceAll('"', '\\"')}";`;
}

export function resolveCmsWorkerConfig(
	resolvedConfig: CmsCloudflareWorkerConfig,
	cloudflareConfig: CmsCloudflareConfig | undefined,
): Partial<WorkerConfig> {
	const directConfig =
		cloudflareConfig === undefined || isCloudflareConfigReference(cloudflareConfig)
			? {}
			: cloudflareConfig;
	const existingAssets = {
		...resolvedConfig.assets,
		...directConfig.assets,
	};
	return {
		...resolvedConfig,
		...directConfig,
		vars: { ...resolvedConfig.vars, ...directConfig.vars },
		main: resolve(process.cwd(), "src/waku.server.ts"),
		assets: {
			...existingAssets,
			directory: resolve(process.cwd(), "dist/public"),
			binding: CMS_BINDINGS.staticAssets,
		},
	};
}

export default createCmsWakuConfigFromEnvironment();

function createCmsWakuConfigFromEnvironment() {
	const runtimeConfig = readCmsRuntimeConfig();
	return runtimeConfig
		? createCmsWakuConfig(runtimeConfig.config, runtimeConfig.wranglerConfigPath)
		: createCmsWakuConfig();
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
