import { commonFlags, BaseCommand } from "#cli/base-command";
import { assertProcessSucceeded, runPnpm } from "#cli/process/run";
import { createProjectEnvironment } from "#cli/project/environment";
import { readConsumerWranglerConfig, resolvePluginDeployConfig } from "#cli/project/wrangler-files";
import {
	isCloudflareConfigReference,
	validateDeployConfig,
	type CmsCloudflareWorkerConfig,
} from "@repo/config";

export default class Deploy extends BaseCommand {
	static override description =
		"Build and deploy the CMS Worker without applying database migrations";
	static override flags = commonFlags;

	async run(): Promise<void> {
		const { flags } = await this.parse(Deploy);
		await this.withProject(flags, async ({ paths, config }) => {
			let deployConfig: CmsCloudflareWorkerConfig;
			const selectedWranglerConfig = config.wranglerConfigPath
				? readConsumerWranglerConfig(config.wranglerConfigPath, config.environmentName)
				: undefined;
			if (isCloudflareConfigReference(config.cloudflare)) {
				if (selectedWranglerConfig === undefined) {
					throw new Error("A selected Wrangler config path is required for cloudflare.configPath.");
				}
				deployConfig = selectedWranglerConfig;
			} else {
				deployConfig = {
					...selectedWranglerConfig,
					...config.cloudflare,
					vars: { ...selectedWranglerConfig?.vars, ...config.cloudflare.vars },
				};
			}
			validateDeployConfig(deployConfig);
			const environment = createProjectEnvironment(config, paths);
			const build = await runPnpm(["waku", "build"], paths.cmsDirectory, environment);
			assertProcessSucceeded(build, "waku build", (message, options) =>
				this.error(message, options),
			);
			const wranglerConfig = await resolvePluginDeployConfig(paths, deployConfig.name);
			const deploy = await runPnpm(
				["wrangler", "deploy", "--config", wranglerConfig],
				paths.cmsDirectory,
				environment,
			);
			assertProcessSucceeded(deploy, "wrangler deploy", (message, options) =>
				this.error(message, options),
			);
		});
	}
}
