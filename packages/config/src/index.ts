import type { WorkerConfig } from "@cloudflare/vite-plugin";
import { z } from "zod";

const nonEmptyText = z.string().trim().min(1);

const displaySettingsSchema = z
	.object({
		name: nonEmptyText.default("お知らせ CMS"),
		description: nonEmptyText.default("お知らせを管理するCMS"),
		iconUrl: z
			.string()
			.trim()
			.transform((value) => value || undefined)
			.optional(),
		themeStorageKey: nonEmptyText.default("cms-theme"),
		newsFormStoragePrefix: nonEmptyText.default("cms:news-form"),
	})
	.strict();

const devServerConfigSchema = z
	.object({
		allowedHosts: z.array(nonEmptyText).default([]),
	})
	.strict();

const cloudflareConfigReferenceSchema = z
	.object({
		configPath: nonEmptyText,
	})
	.strict();

const removedCloudflareAliases = new Set([
	"workerName",
	"compatibilityDate",
	"compatibilityFlags",
	"workersDev",
	"databaseName",
	"databaseId",
	"bucketName",
	"accessTeamDomain",
	"accessAudience",
]);

const cloudflareConfigSchema = z
	.union([
		cloudflareConfigReferenceSchema,
		z.custom<CmsCloudflareWorkerConfig>(
			(value) =>
				isRecord(value) &&
				!("configPath" in value) &&
				!Object.keys(value).some((name) => removedCloudflareAliases.has(name)),
			"Expected native Cloudflare WorkerConfig fields or a configPath reference.",
		),
	])
	.default({});

const cmsConfigSchema = displaySettingsSchema
	.extend({
		devServer: devServerConfigSchema.default(() => devServerConfigSchema.parse({})),
		cloudflare: cloudflareConfigSchema,
	})
	.strict();

export type CmsConfigInput = z.input<typeof cmsConfigSchema>;
export type CmsConfig = z.output<typeof cmsConfigSchema>;
export type CmsCloudflareConfig = CmsConfig["cloudflare"];
export type CmsCloudflareConfigReference = z.output<typeof cloudflareConfigReferenceSchema>;
export type CmsCloudflareWorkerConfig = Omit<Partial<WorkerConfig>, "configPath">;
export type CmsDevServerConfig = CmsConfig["devServer"];
export type CmsDisplaySettings = Pick<
	CmsConfig,
	"name" | "description" | "iconUrl" | "themeStorageKey" | "newsFormStoragePrefix"
>;

export const CMS_BINDINGS = Object.freeze({
	database: "DB",
	assets: "ASSETS",
	staticAssets: "STATIC_ASSETS",
});

export const CMS_CONFIG_DEFAULTS = Object.freeze(cmsConfigSchema.parse({}));

export function defineConfig(input: CmsConfigInput): CmsConfig {
	return cmsConfigSchema.parse(input);
}

export function validateConfig(input: unknown): CmsConfig {
	return cmsConfigSchema.parse(input);
}

export function isCloudflareConfigReference(
	config: CmsCloudflareConfig,
): config is CmsCloudflareConfigReference {
	return "configPath" in config;
}

export function validateDeployConfig(config: CmsCloudflareWorkerConfig): void {
	const errors: string[] = [];
	if (typeof config.name !== "string" || config.name.trim().length === 0) {
		errors.push("cloudflare.name must be set to the Worker name");
	}

	const database = config.d1_databases?.find(
		(binding) => binding.binding === CMS_BINDINGS.database,
	);
	if (!database?.database_id || database.database_id === "00000000-0000-0000-0000-000000000000") {
		errors.push(`cloudflare.d1_databases must include a ${CMS_BINDINGS.database} binding`);
	}
	const assets = config.r2_buckets?.find((binding) => binding.binding === CMS_BINDINGS.assets);
	if (!assets?.bucket_name) {
		errors.push(`cloudflare.r2_buckets must include an ${CMS_BINDINGS.assets} binding`);
	}
	if (!isConfiguredAccessValue(config.vars?.ACCESS_TEAM_DOMAIN)) {
		errors.push(
			"cloudflare.vars.ACCESS_TEAM_DOMAIN must be set to the Cloudflare Access team domain",
		);
	}
	if (!isConfiguredAccessValue(config.vars?.ACCESS_AUDIENCE)) {
		errors.push("cloudflare.vars.ACCESS_AUDIENCE must be set to the Cloudflare Access audience");
	}

	if (errors.length > 0) {
		throw new Error(`Cloudflare deploy configuration is incomplete:\n- ${errors.join("\n- ")}`);
	}
}

export function projectDisplaySettings(config: CmsConfig): CmsDisplaySettings {
	return {
		name: config.name,
		description: config.description,
		iconUrl: config.iconUrl,
		themeStorageKey: config.themeStorageKey,
		newsFormStoragePrefix: config.newsFormStoragePrefix,
	};
}

function isConfiguredAccessValue(value: unknown): value is string {
	return (
		typeof value === "string" &&
		value.trim().length > 0 &&
		value !== "example.cloudflareaccess.com" &&
		!value.startsWith("replace-with-")
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
