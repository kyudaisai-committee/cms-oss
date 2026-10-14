import { describe, expect, it } from "vitest";

import {
	CMS_BINDINGS,
	CMS_CONFIG_DEFAULTS,
	defineConfig,
	isCloudflareConfigReference,
	projectDisplaySettings,
	validateConfig,
	validateDeployConfig,
	type CmsCloudflareWorkerConfig,
} from "#config/index";

describe("CMS configuration contract", () => {
	it("provides the display defaults and fixed Worker bindings", () => {
		expect(CMS_CONFIG_DEFAULTS.devServer).toEqual({ allowedHosts: [] });
		expect(projectDisplaySettings(CMS_CONFIG_DEFAULTS)).toEqual({
			name: "お知らせ CMS",
			description: "お知らせを管理するCMS",
			iconUrl: undefined,
			themeStorageKey: "cms-theme",
			newsFormStoragePrefix: "cms:news-form",
		});
		expect(CMS_BINDINGS).toEqual({
			database: "DB",
			assets: "ASSETS",
			staticAssets: "STATIC_ASSETS",
		});
	});

	it("validates consumer-owned Waku development hosts", () => {
		expect(defineConfig({ devServer: { allowedHosts: ["cms.example.test"] } }).devServer).toEqual({
			allowedHosts: ["cms.example.test"],
		});
		expect(() => defineConfig({ devServer: { allowedHosts: [" "] } })).toThrow();
	});

	it("uses native Cloudflare WorkerConfig fields and supports a configPath reference", () => {
		const nativeWorkerConfig: CmsCloudflareWorkerConfig = {
			name: "consumer-cms",
			compatibility_date: "2026-09-25",
			workers_dev: true,
			d1_databases: [
				{
					binding: CMS_BINDINGS.database,
					database_name: "consumer-db",
					database_id: "11111111-1111-4111-8111-111111111111",
				},
			],
		};
		const direct = defineConfig({ cloudflare: nativeWorkerConfig });
		const reference = defineConfig({ cloudflare: { configPath: "./wrangler.jsonc" } });

		expect(direct.cloudflare).toEqual(nativeWorkerConfig);
		expect(isCloudflareConfigReference(reference.cloudflare)).toBe(true);
		expect(() => validateConfig({ cloudflare: { workerName: "old-alias" } })).toThrow();
	});

	it("trims display settings and keeps only the explicit client projection", () => {
		const config = defineConfig({
			name: " Example CMS ",
			cloudflare: { vars: { ACCESS_AUDIENCE: "private-audience" } },
		});

		expect(projectDisplaySettings(config)).toEqual({
			name: "Example CMS",
			description: "お知らせを管理するCMS",
			iconUrl: undefined,
			themeStorageKey: "cms-theme",
			newsFormStoragePrefix: "cms:news-form",
		});
		expect(projectDisplaySettings(config)).not.toHaveProperty("cloudflare");
		expect(() => validateConfig({ name: "Example CMS", secret: "not-public" })).toThrow();
	});

	it("requires native Worker bindings and Access variables before deploy", () => {
		const configured: CmsCloudflareWorkerConfig = {
			name: "consumer-cms",
			d1_databases: [
				{
					binding: "DB",
					database_name: "consumer-db",
					database_id: "11111111-1111-4111-8111-111111111111",
				},
			],
			r2_buckets: [{ binding: "ASSETS", bucket_name: "consumer-assets" }],
			vars: {
				ACCESS_TEAM_DOMAIN: "committee.cloudflareaccess.com",
				ACCESS_AUDIENCE: "consumer-audience",
			},
		};

		expect(() => validateDeployConfig(configured)).not.toThrow();
		expect(() => validateDeployConfig({})).toThrow("Cloudflare deploy configuration is incomplete");
	});
});
