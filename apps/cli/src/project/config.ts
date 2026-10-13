import { dirname } from "node:path";

import { createJiti } from "jiti";

import {
	resolveEnvironment,
	validateConfig,
	type CmsConfig,
	type CmsCloudflareConfig,
} from "@repo/config";

export interface LoadedCmsConfig {
	config: CmsConfig;
	configDirectory: string;
	cloudflare: CmsCloudflareConfig;
	environmentName: string | undefined;
}

interface ConfigModule {
	default?: unknown;
}

export async function loadCmsConfig(
	configPath: string,
	environmentName?: string,
): Promise<LoadedCmsConfig> {
	const jiti = createJiti(configPath, { moduleCache: false });
	let module: ConfigModule;
	try {
		module = await jiti.import<ConfigModule>(configPath);
	} catch (error) {
		throw new Error(`Could not load CMS configuration at ${configPath}.`, { cause: error });
	}

	const config = validateConfig(module.default);
	const environment = resolveEnvironment(config, environmentName);
	return {
		config,
		configDirectory: dirname(configPath),
		cloudflare: environment.cloudflare,
		environmentName: environment.name,
	};
}
