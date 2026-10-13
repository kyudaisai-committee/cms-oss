import { commonFlags, BaseCommand } from "#cli/base-command";
import { assertProcessSucceeded, runPnpm } from "#cli/process/run";
import { createProjectEnvironment } from "#cli/project/environment";
import { resolvePluginDeployConfig } from "#cli/project/wrangler-files";
import { validateDeployConfig } from "@repo/config";

export default class Deploy extends BaseCommand {
	static override description =
		"Build and deploy the CMS Worker without applying database migrations";
	static override flags = commonFlags;

	async run(): Promise<void> {
		const { flags } = await this.parse(Deploy);
		await this.withProject(flags, async ({ paths, config }) => {
			validateDeployConfig(config.cloudflare);
			const environment = createProjectEnvironment(config.config, paths, config.environmentName);
			const build = await runPnpm(["waku", "build"], paths.cmsDirectory, environment);
			assertProcessSucceeded(build, "waku build", (message, options) =>
				this.error(message, options),
			);
			const wranglerConfig = await resolvePluginDeployConfig(paths, config.cloudflare.workerName);
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
