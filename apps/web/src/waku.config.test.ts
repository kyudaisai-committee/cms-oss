import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { defineConfig } from "@repo/config";

import {
	createCmsWakuConfig,
	readCmsRuntimeConfig,
	resolveCmsWorkerConfig,
} from "../waku.config.js";

describe("CMS Waku configuration", () => {
	it("loads CLI config data and applies consumer allowed hosts to the real Vite server options", () => {
		const inputConfig = defineConfig({
			name: "Consumer CMS",
			devServer: { allowedHosts: ["cms.example.test"] },
			cloudflare: {
				name: "consumer-worker",
				compatibility_date: "2026-10-14",
				d1_databases: [
					{
						binding: "DB",
						database_name: "consumer-db",
						database_id: "11111111-1111-4111-8111-111111111111",
					},
				],
			},
		});
		const runtimeConfig = readCmsRuntimeConfig({
			CMS_RUNTIME_CONFIG: JSON.stringify({
				config: inputConfig,
				wranglerConfigPath: undefined,
			}),
		});

		expect(runtimeConfig?.config).toEqual(inputConfig);
		const config = createCmsWakuConfig(runtimeConfig?.config, runtimeConfig?.wranglerConfigPath);
		expect(config.vite?.server?.allowedHosts).toEqual(["cms.example.test"]);
	});

	it("preserves user Worker settings while replacing only the CMS entry and asset directory", () => {
		const directCloudflareConfig = {
			name: "consumer-worker",
			compatibility_date: "2026-10-14",
			compatibility_flags: ["nodejs_als"],
			workers_dev: false,
			vars: { FEATURE_FLAG: "enabled" },
			d1_databases: [
				{
					binding: "DB",
					database_name: "consumer-db",
					database_id: "11111111-1111-4111-8111-111111111111",
				},
			],
		};
		const inputConfig = defineConfig({ cloudflare: directCloudflareConfig });
		const result = resolveCmsWorkerConfig(
			{
				name: "plugin-default",
				vars: { FROM_WRANGLER: "kept" },
				assets: { directory: "./consumer-assets", binding: "CUSTOM_ASSETS" },
			},
			inputConfig.cloudflare,
		);

		expect(result.name).toBe("consumer-worker");
		expect(result.compatibility_date).toBe("2026-10-14");
		expect(result.compatibility_flags).toEqual(["nodejs_als"]);
		expect(result.workers_dev).toBe(false);
		expect(result.vars).toEqual({ FROM_WRANGLER: "kept", FEATURE_FLAG: "enabled" });
		expect(result.d1_databases).toEqual(directCloudflareConfig.d1_databases);
		expect(result.main).toBe(resolve(process.cwd(), "src/waku.server.ts"));
		expect(result.assets).toEqual({
			directory: resolve(process.cwd(), "dist/public"),
			binding: "STATIC_ASSETS",
		});
	});

	it("uses selected Wrangler config for references and keeps its bindings intact", () => {
		const inputConfig = defineConfig({
			cloudflare: { configPath: "./wrangler.jsonc" },
		});
		const runtimeConfig = readCmsRuntimeConfig({
			CMS_RUNTIME_CONFIG: JSON.stringify({
				config: inputConfig,
				wranglerConfigPath: "/consumer/wrangler.production.jsonc",
			}),
		});
		const config = createCmsWakuConfig(runtimeConfig?.config, runtimeConfig?.wranglerConfigPath);
		const resolved = resolveCmsWorkerConfig(
			{
				name: "production-worker",
				vars: { ACCESS_AUDIENCE: "production-audience" },
				d1_databases: [
					{
						binding: "DB",
						database_name: "production-db",
						database_id: "22222222-2222-4222-8222-222222222222",
					},
				],
			},
			inputConfig.cloudflare,
		);

		expect(config.vite?.server?.allowedHosts).toEqual([]);
		expect(resolved.name).toBe("production-worker");
		expect(resolved.vars).toEqual({ ACCESS_AUDIENCE: "production-audience" });
		expect(resolved.d1_databases?.[0]?.database_id).toBe("22222222-2222-4222-8222-222222222222");
		expect(resolved.main).toBe(resolve(process.cwd(), "src/waku.server.ts"));
	});

	it("does not add allowed hosts by default", () => {
		const config = createCmsWakuConfig();

		expect(config.vite?.server?.allowedHosts).toEqual([]);
	});
});
