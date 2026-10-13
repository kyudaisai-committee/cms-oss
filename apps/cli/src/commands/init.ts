import { mkdir } from "node:fs/promises";

import { commonFlags, BaseCommand } from "#cli/base-command";
import { loadCmsConfig } from "#cli/project/config";
import { ensureStarterFiles, generateCmsProject, withProjectLock } from "#cli/project/generate";
import { resolveProjectPaths } from "#cli/project/paths";

export default class Init extends BaseCommand {
	static override description = "Create the CMS consumer configuration and generated Waku project";
	static override flags = commonFlags;

	async run(): Promise<void> {
		const { flags } = await this.parse(Init);
		const paths = resolveProjectPaths(flags.cwd ?? process.cwd(), flags.config);
		await mkdir(paths.projectRoot, { recursive: true });
		await withProjectLock(paths.projectRoot, async () => {
			await ensureStarterFiles(paths);
			await loadCmsConfig(paths.configPath, flags.env);
			await generateCmsProject(paths);
		});
		this.log(
			`Generated ${paths.cmsDirectory}. Consumer configuration and migration files remain in ${paths.projectRoot}.`,
		);
	}
}
