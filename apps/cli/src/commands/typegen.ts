import { join } from "node:path";

import { commonFlags, BaseCommand } from "#cli/base-command";
import { assertProcessSucceeded, runPnpm } from "#cli/process/run";
import { createProjectEnvironment } from "#cli/project/environment";
import { resolveConsumerWranglerConfig } from "#cli/project/wrangler-files";

export default class Typegen extends BaseCommand {
	static override description = "Generate Waku route and Cloudflare Worker types";
	static override flags = commonFlags;

	async run(): Promise<void> {
		const { flags } = await this.parse(Typegen);
		await this.withProject(flags, async ({ paths, config }) => {
			const wranglerConfigPath =
				config.wranglerConfigPath ??
				(await resolveConsumerWranglerConfig(paths, flags["wrangler-config"], config.cloudflare));
			const environment = createProjectEnvironment(config, paths);
			const routeTypes = await runPnpm(
				["waku", "router", "typegen"],
				paths.cmsDirectory,
				environment,
			);
			assertProcessSucceeded(routeTypes, "waku router typegen", (message, options) =>
				this.error(message, options),
			);
			const wranglerArguments = ["wrangler", "types", "--config", wranglerConfigPath];
			if (config.environmentName) wranglerArguments.push("--env", config.environmentName);
			wranglerArguments.push(join(paths.cmsDirectory, "worker-configuration.d.ts"));
			const workerTypes = await runPnpm(wranglerArguments, paths.projectRoot, environment);
			assertProcessSucceeded(workerTypes, "wrangler types", (message, options) =>
				this.error(message, options),
			);
		});
	}
}
