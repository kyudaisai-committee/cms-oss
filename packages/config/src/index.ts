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

const cloudflareConfigSchema = z
	.object({
		workerName: z
			.string()
			.trim()
			.regex(/^[a-z0-9-]+$/)
			.default("cms"),
		compatibilityDate: z.iso.date().default("2026-09-25"),
		compatibilityFlags: z.array(nonEmptyText).default(["nodejs_als"]),
		workersDev: z.boolean().default(true),
		databaseName: z
			.string()
			.trim()
			.regex(/^[a-zA-Z0-9_-]+$/)
			.default("cms-local"),
		databaseId: z.uuid().default("00000000-0000-0000-0000-000000000000"),
		bucketName: z
			.string()
			.trim()
			.regex(/^[a-z0-9-]+$/)
			.default("cms-assets"),
		accessTeamDomain: nonEmptyText.default("example.cloudflareaccess.com"),
		accessAudience: nonEmptyText.default("replace-with-cloudflare-access-audience"),
		routes: z.array(nonEmptyText).default([]),
	})
	.strict();

const environmentSchema = z
	.object({
		cloudflare: cloudflareConfigSchema,
	})
	.strict();

const cmsConfigSchema = displaySettingsSchema
	.extend({
		devServer: devServerConfigSchema.default(() => devServerConfigSchema.parse({})),
		cloudflare: cloudflareConfigSchema.default(() => cloudflareConfigSchema.parse({})),
		environments: z.record(z.string().trim().min(1), environmentSchema).default({}),
	})
	.strict();

export type CmsConfigInput = z.input<typeof cmsConfigSchema>;
export type CmsConfig = z.output<typeof cmsConfigSchema>;
export type CmsCloudflareConfig = CmsConfig["cloudflare"];
export type CmsDevServerConfig = CmsConfig["devServer"];
export type CmsDisplaySettings = Pick<
	CmsConfig,
	"name" | "description" | "iconUrl" | "themeStorageKey" | "newsFormStoragePrefix"
>;

export interface ResolvedCmsEnvironment {
	name: string | undefined;
	cloudflare: CmsCloudflareConfig;
}

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

export function resolveEnvironment(
	config: CmsConfig,
	environmentName?: string,
): ResolvedCmsEnvironment {
	if (environmentName === undefined) {
		return { name: undefined, cloudflare: config.cloudflare };
	}

	const environment = config.environments[environmentName];
	if (!environment) {
		throw new Error(
			`Unknown Cloudflare environment "${environmentName}". Define it in cms.config.ts before using --env.`,
		);
	}

	return { name: environmentName, cloudflare: environment.cloudflare };
}

export function validateDeployConfig(config: CmsCloudflareConfig): void {
	const errors: string[] = [];
	if (config.databaseId === "00000000-0000-0000-0000-000000000000") {
		errors.push("cloudflare.databaseId must be set to a real D1 database ID");
	}
	if (config.accessTeamDomain === "example.cloudflareaccess.com") {
		errors.push("cloudflare.accessTeamDomain must be set to the Cloudflare Access team domain");
	}
	if (config.accessAudience === "replace-with-cloudflare-access-audience") {
		errors.push("cloudflare.accessAudience must be set to the Cloudflare Access audience");
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
