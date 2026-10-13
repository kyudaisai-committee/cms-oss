import { resolveDrizzleOutputDirectory } from "../migration/initial-ddl.js";
import type { LoadedCmsConfig } from "./config.js";
import { assertConsumerD1Target } from "./d1-target.js";
import type { ProjectPaths } from "./paths.js";
import { resolveConsumerWranglerConfig } from "./wrangler-files.js";

export type D1MigrationAction = "list" | "apply";
export type D1MigrationLocation = "local" | "remote";

export interface D1MigrationContext {
	wranglerConfigPath: string;
	drizzleOutputDirectory: string;
	databaseName: string;
	databaseId: string;
	environmentName: string | undefined;
	location: D1MigrationLocation;
	persistTo: string | undefined;
}

export async function resolveD1MigrationContext(
	paths: ProjectPaths,
	cmsConfig: LoadedCmsConfig,
	wranglerConfigArgument: string | undefined,
	location: D1MigrationLocation,
): Promise<D1MigrationContext> {
	const wranglerConfigPath = await resolveConsumerWranglerConfig(paths, wranglerConfigArgument);
	const drizzleOutputDirectory = await resolveDrizzleOutputDirectory(paths.drizzleConfigPath);
	assertConsumerD1Target(
		wranglerConfigPath,
		cmsConfig.environmentName,
		cmsConfig.cloudflare,
		drizzleOutputDirectory,
	);

	return {
		wranglerConfigPath,
		drizzleOutputDirectory,
		databaseName: cmsConfig.cloudflare.databaseName,
		databaseId: cmsConfig.cloudflare.databaseId,
		environmentName: cmsConfig.environmentName,
		location,
		persistTo: location === "local" ? paths.wranglerStateDirectory : undefined,
	};
}

export function createD1MigrationArguments(
	action: D1MigrationAction,
	context: D1MigrationContext,
): string[] {
	const args = [
		"wrangler",
		"d1",
		"migrations",
		action,
		context.databaseName,
		"--config",
		context.wranglerConfigPath,
	];
	if (context.environmentName !== undefined) args.push("--env", context.environmentName);
	args.push(`--${context.location}`);
	if (context.persistTo !== undefined) args.push("--persist-to", context.persistTo);
	return args;
}
