import { describe, expect, it } from "vitest";

import {
	CMS_BINDINGS,
	CMS_CONFIG_DEFAULTS,
	defineConfig,
	projectDisplaySettings,
	resolveEnvironment,
	validateConfig,
	validateDeployConfig,
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

	it("trims display settings and keeps only the explicit client projection", () => {
		const config = defineConfig({
			name: " Example CMS ",
			cloudflare: { accessAudience: "private-audience" },
		});

		expect(projectDisplaySettings(config)).toEqual({
			name: "Example CMS",
			description: "お知らせを管理するCMS",
			iconUrl: undefined,
			themeStorageKey: "cms-theme",
			newsFormStoragePrefix: "cms:news-form",
		});
		expect(projectDisplaySettings(config)).not.toHaveProperty("cloudflare");
	});

	it("rejects unknown config and invalid Cloudflare binding inputs", () => {
		expect(() => validateConfig({ name: "Example CMS", secret: "not-public" })).toThrow();
		expect(() => defineConfig({ cloudflare: { databaseId: "not-a-uuid" } })).toThrow();
	});

	it("requires named environments and does not inherit the base Cloudflare account", () => {
		const config = defineConfig({
			cloudflare: { databaseId: "11111111-1111-4111-8111-111111111111" },
			environments: {
				staging: {
					cloudflare: {
						databaseId: "22222222-2222-4222-8222-222222222222",
					},
				},
			},
		});

		expect(resolveEnvironment(config, "staging")).toEqual({
			name: "staging",
			cloudflare: expect.objectContaining({
				databaseId: "22222222-2222-4222-8222-222222222222",
			}),
		});
		expect(() => resolveEnvironment(config, "production")).toThrow(
			"Unknown Cloudflare environment",
		);
	});

	it("refuses example Cloudflare settings before deploy", () => {
		expect(() => validateDeployConfig(CMS_CONFIG_DEFAULTS.cloudflare)).toThrow(
			"Cloudflare deploy configuration is incomplete",
		);
	});
});
