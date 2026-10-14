import { dirname, resolve } from "node:path";

import { unstable_readConfig, type Unstable_Config } from "wrangler";

import { assertWranglerEnvironmentExists } from "#cli/project/wrangler-files";
import {
	CMS_BINDINGS,
	isCloudflareConfigReference,
	type CmsCloudflareConfig,
	type CmsCloudflareWorkerConfig,
} from "@repo/config";

export interface ConsumerD1Target {
	databaseName: string;
	databaseId: string | undefined;
	migrationsDirectory: string;
	migrationsTableName: string;
}

export function assertConsumerD1Target(
	configPath: string,
	environmentName: string | undefined,
	cloudflareConfig: CmsCloudflareConfig,
	drizzleOutputDirectory: string,
	directConfigPathBase = dirname(configPath),
): ConsumerD1Target {
	if (environmentName !== undefined) {
		assertWranglerEnvironmentExists(configPath, environmentName);
	}
	let wranglerConfig: Unstable_Config;
	try {
		wranglerConfig = unstable_readConfig(
			{ config: configPath, env: environmentName },
			{ hideWarnings: true },
		);
	} catch (error) {
		throw new Error(
			`Could not read the selected Wrangler configuration${environmentName ? ` for environment "${environmentName}"` : ""}: ${configPath}`,
			{ cause: error },
		);
	}

	const database = wranglerConfig.d1_databases.find(
		(binding) => binding.binding === CMS_BINDINGS.database,
	);
	if (!database) {
		throw new Error(
			`The selected Wrangler configuration${environmentName ? ` for environment "${environmentName}"` : ""} has no D1 binding named ${CMS_BINDINGS.database}.`,
		);
	}
	if (!isCloudflareConfigReference(cloudflareConfig)) {
		assertDirectD1Target(cloudflareConfig, database, configPath, directConfigPathBase);
	}

	const databaseName = database.database_name ?? database.database_id;
	if (!databaseName) {
		throw new Error(
			`The selected Wrangler ${CMS_BINDINGS.database} binding must set database_name or database_id.`,
		);
	}
	const migrationsDirectory = resolve(
		dirname(configPath),
		database.migrations_dir ?? "./migrations",
	);
	if (migrationsDirectory !== drizzleOutputDirectory) {
		throw new Error(
			`The selected Wrangler D1 binding ${CMS_BINDINGS.database} reads migrations from ${migrationsDirectory}, but the existing Drizzle configuration writes them to ${drizzleOutputDirectory}. Set migrations_dir in the existing Wrangler configuration to the Drizzle out directory; cms does not edit Wrangler configuration files.`,
		);
	}
	return {
		databaseName,
		databaseId: database.database_id,
		migrationsDirectory,
		migrationsTableName: database.migrations_table ?? "d1_migrations",
	};
}

function assertDirectD1Target(
	cloudflareConfig: CmsCloudflareWorkerConfig,
	database: Unstable_Config["d1_databases"][number],
	configPath: string,
	directConfigPathBase: string,
): void {
	if (cloudflareConfig.d1_databases === undefined) return;
	const configuredDatabase = cloudflareConfig.d1_databases.find(
		(binding) => binding.binding === CMS_BINDINGS.database,
	);
	if (!configuredDatabase) {
		throw new Error(
			`Direct cloudflare settings must include a ${CMS_BINDINGS.database} D1 binding or use cloudflare.configPath to reference Wrangler settings.`,
		);
	}
	if (
		(configuredDatabase.database_name !== undefined &&
			configuredDatabase.database_name !== database.database_name) ||
		(configuredDatabase.database_id !== undefined &&
			configuredDatabase.database_id !== database.database_id)
	) {
		throw new Error(
			`The selected Wrangler D1 binding ${CMS_BINDINGS.database} targets ${database.database_name} (${database.database_id}), but the direct Cloudflare configuration expects ${configuredDatabase.database_name} (${configuredDatabase.database_id}). Select matching configurations or use cloudflare.configPath to reference Wrangler settings.`,
		);
	}
	const selectedMigrationsDirectory = resolve(
		dirname(configPath),
		database.migrations_dir ?? "./migrations",
	);
	if (
		configuredDatabase.migrations_dir !== undefined &&
		resolve(directConfigPathBase, configuredDatabase.migrations_dir) !== selectedMigrationsDirectory
	) {
		throw new Error(
			`The direct Cloudflare D1 binding ${CMS_BINDINGS.database} uses migrations_dir ${configuredDatabase.migrations_dir}, but the selected Wrangler configuration resolves it to ${selectedMigrationsDirectory}. Select matching migration directories or use cloudflare.configPath to reference Wrangler settings.`,
		);
	}
	const selectedMigrationsTable = database.migrations_table ?? "d1_migrations";
	if (
		configuredDatabase.migrations_table !== undefined &&
		configuredDatabase.migrations_table !== selectedMigrationsTable
	) {
		throw new Error(
			`The direct Cloudflare D1 binding ${CMS_BINDINGS.database} uses migrations_table ${configuredDatabase.migrations_table}, but the selected Wrangler configuration uses ${selectedMigrationsTable}. Select matching migration tables or use cloudflare.configPath to reference Wrangler settings.`,
		);
	}
}
