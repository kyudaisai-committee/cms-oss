import { dirname } from "node:path";

import { createJiti } from "jiti";

import { validateConfig, type CmsCloudflareConfig, type CmsConfig } from "@repo/config";

export interface LoadedCmsConfig {
	config: CmsConfig;
	configDirectory: string;
	cloudflare: CmsCloudflareConfig;
	environmentName: string | undefined;
	wranglerConfigPath: string | undefined;
}

interface ConfigModule {
	default?: unknown;
}

export async function loadCmsConfig(
	configPath: string,
	environmentName?: string,
	wranglerConfigPath?: string,
): Promise<LoadedCmsConfig> {
	const jiti = createJiti(configPath, { moduleCache: false });
	let module: ConfigModule;
	try {
		module = await jiti.import<ConfigModule>(configPath);
	} catch (error) {
		throw new Error(`Could not load CMS configuration at ${configPath}.`, { cause: error });
	}

	const config = validateConfig(module.default);
	return {
		config,
		configDirectory: dirname(configPath),
		cloudflare: config.cloudflare,
		environmentName,
		wranglerConfigPath,
	};
}
