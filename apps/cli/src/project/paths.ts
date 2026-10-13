import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CMS_PROJECT_DIRECTORY = ".cms";

export interface ProjectPaths {
	projectRoot: string;
	configPath: string;
	cmsDirectory: string;
	drizzleConfigPath: string;
	wranglerStateDirectory: string;
	packageRoot: string;
	webSourceDirectory: string;
}

export function resolveProjectPaths(cwd: string, configArgument?: string): ProjectPaths {
	const configPath = resolve(cwd, configArgument ?? "cms.config.ts");
	const projectRoot = dirname(configPath);
	const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
	const packagedWebSource = join(packageRoot, "dist/web/src");
	const developmentWebSource = resolve(packageRoot, "../web/src");

	return {
		projectRoot,
		configPath,
		cmsDirectory: join(projectRoot, CMS_PROJECT_DIRECTORY),
		drizzleConfigPath: join(projectRoot, "drizzle.config.ts"),
		wranglerStateDirectory: join(projectRoot, ".wrangler", "state"),
		packageRoot,
		webSourceDirectory: packagedWebSource,
	};
}
