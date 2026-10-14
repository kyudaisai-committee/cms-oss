import { access } from "node:fs/promises";

import { commonFlags, BaseCommand } from "#cli/base-command";
import {
	assertInitialMigrationArtifactsExist,
	assertInitialMigrationDirectoryIsEmpty,
	resolveDrizzleOutputDirectory,
} from "#cli/migration/initial-ddl";
import {
	createEmptyCmsMigrationState,
	createCmsMigrationContext,
	writeCmsMigrationState,
} from "#cli/migration/state";
import { assertProcessSucceeded, runPnpm } from "#cli/process/run";
import { createProjectEnvironment } from "#cli/project/environment";

export default class Init extends BaseCommand {
	static override description =
		"Generate the current consumer-owned initial SQL, snapshot, and journal without applying them";
	static override flags = commonFlags;

	async run(): Promise<void> {
		const { flags } = await this.parse(Init);
		await this.withProjectContext(flags, async ({ paths, config }) => {
			const context = await createCmsMigrationContext(paths.packageRoot, paths.projectRoot);
			try {
				await access(paths.cmsDirectory);
			} catch (error) {
				if (!hasErrorCode(error, "ENOENT")) throw error;
				throw new Error(
					`Generated CMS project is missing at ${paths.cmsDirectory}. Run cms init first.`,
					{
						cause: error,
					},
				);
			}
			try {
				await access(paths.drizzleConfigPath);
			} catch (error) {
				if (!hasErrorCode(error, "ENOENT")) throw error;
				throw new Error(
					`Drizzle configuration is missing at ${paths.drizzleConfigPath}. Run cms init first.`,
					{
						cause: error,
					},
				);
			}
			const outputDirectory = await resolveDrizzleOutputDirectory(paths.drizzleConfigPath);
			await assertInitialMigrationDirectoryIsEmpty(outputDirectory, context.statePath);

			const result = await runPnpm(
				["drizzle-kit", "generate", "--config", paths.drizzleConfigPath, "--name", "cms-initial"],
				paths.projectRoot,
				createProjectEnvironment(config, paths),
			);
			assertProcessSucceeded(result, "drizzle-kit generate", (message, options) =>
				this.error(message, options),
			);
			await assertInitialMigrationArtifactsExist(outputDirectory);
			await writeCmsMigrationState(context.statePath, createEmptyCmsMigrationState());
			this.log(
				`Generated the initial consumer-owned Drizzle migration under ${outputDirectory}. No D1 database was changed.`,
			);
		});
	}
}

function hasErrorCode(error: unknown, code: string): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
