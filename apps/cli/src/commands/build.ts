import { commonFlags, BaseCommand } from "#cli/base-command";
import { assertProcessSucceeded, runPnpm } from "#cli/process/run";
import { createProjectEnvironment } from "#cli/project/environment";

export default class Build extends BaseCommand {
	static override description = "Build the generated CMS Waku project";
	static override flags = commonFlags;

	async run(): Promise<void> {
		const { flags } = await this.parse(Build);
		await this.withProject(flags, async ({ paths, config }) => {
			const result = await runPnpm(
				["waku", "build"],
				paths.cmsDirectory,
				createProjectEnvironment(config, paths),
			);
			assertProcessSucceeded(result, "waku build", (message, options) =>
				this.error(message, options),
			);
		});
	}
}
