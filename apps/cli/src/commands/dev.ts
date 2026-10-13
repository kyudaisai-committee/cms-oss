import { commonFlags, BaseCommand } from "#cli/base-command";
import { assertProcessSucceeded, runPnpm } from "#cli/process/run";
import { createProjectEnvironment } from "#cli/project/environment";

export default class Dev extends BaseCommand {
	static override description = "Run the generated CMS Waku project";
	static override flags = commonFlags;

	async run(): Promise<void> {
		const { flags } = await this.parse(Dev);
		await this.withProject(flags, async ({ paths, config }) => {
			const result = await runPnpm(
				["waku", "dev"],
				paths.cmsDirectory,
				createProjectEnvironment(config.config, paths, config.environmentName),
			);
			assertProcessSucceeded(result, "waku dev", (message, options) =>
				this.error(message, options),
			);
		});
	}
}
