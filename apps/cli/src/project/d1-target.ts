import { unstable_readConfig, type Unstable_Config } from "wrangler";

import { CMS_BINDINGS, type CmsCloudflareConfig } from "@repo/config";

export function assertConsumerD1Target(
	configPath: string,
	environmentName: string | undefined,
	cloudflareConfig: CmsCloudflareConfig,
): void {
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
			`The selected Wrangler configuration${environmentName ? ` for environment "${environmentName}"` : ""} has no D1 binding named ${CMS_BINDINGS.database}. cms.config.ts expects database ${cloudflareConfig.databaseName} (${cloudflareConfig.databaseId}).`,
		);
	}
	if (
		database.database_name !== cloudflareConfig.databaseName ||
		database.database_id !== cloudflareConfig.databaseId
	) {
		throw new Error(
			`The selected Wrangler D1 binding ${CMS_BINDINGS.database} targets ${database.database_name} (${database.database_id}), but cms.config.ts expects ${cloudflareConfig.databaseName} (${cloudflareConfig.databaseId}). Select matching configurations before running a D1 command.`,
		);
	}
}
