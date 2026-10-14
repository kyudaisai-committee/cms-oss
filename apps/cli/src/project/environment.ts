import { delimiter, join } from "node:path";

import type { LoadedCmsConfig } from "#cli/project/config";
import type { ProjectPaths } from "#cli/project/paths";
import { projectDisplaySettings } from "@repo/config";

export function createProjectEnvironment(
	loadedConfig: LoadedCmsConfig,
	paths: ProjectPaths,
): NodeJS.ProcessEnv {
	const environment: NodeJS.ProcessEnv = { ...process.env };
	const productBinDirectory = join(paths.packageRoot, "node_modules", ".bin");
	environment.PATH = environment.PATH
		? `${productBinDirectory}${delimiter}${environment.PATH}`
		: productBinDirectory;
	const displaySettings = projectDisplaySettings(loadedConfig.config);
	const exposedSettings: Record<string, string | undefined> = {
		VITE_CMS_NAME: displaySettings.name,
		VITE_CMS_DESCRIPTION: displaySettings.description,
		VITE_CMS_ICON_URL: displaySettings.iconUrl,
		VITE_CMS_THEME_STORAGE_KEY: displaySettings.themeStorageKey,
		VITE_CMS_NEWS_FORM_STORAGE_PREFIX: displaySettings.newsFormStoragePrefix,
	};
	const exposedNames = new Set(Object.keys(exposedSettings));
	for (const name of Object.keys(environment)) {
		if (name.startsWith("VITE_") && !exposedNames.has(name)) {
			delete environment[name];
		}
	}

	for (const [name, value] of Object.entries(exposedSettings)) {
		if (value === undefined) {
			delete environment[name];
		} else {
			environment[name] = value;
		}
	}
	environment.CMS_WRANGLER_STATE_DIR = paths.wranglerStateDirectory;
	environment.CMS_RUNTIME_CONFIG = JSON.stringify({
		config: loadedConfig.config,
		wranglerConfigPath: loadedConfig.wranglerConfigPath,
	});
	if (loadedConfig.environmentName === undefined) {
		delete environment.CLOUDFLARE_ENV;
	} else {
		environment.CLOUDFLARE_ENV = loadedConfig.environmentName;
	}
	if (loadedConfig.wranglerConfigPath === undefined) {
		delete environment.CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH;
	} else {
		environment.CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH = loadedConfig.wranglerConfigPath;
	}
	return environment;
}
