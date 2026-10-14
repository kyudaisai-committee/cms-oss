import { Flags } from "@oclif/core";

import { commonFlags, BaseCommand } from "#cli/base-command";
import { removePendingInitialMigration } from "#cli/migration/initial-pending";
import { prepareCmsInitialMigration } from "#cli/migration/initial-setup";
import { recordCmsBaseline } from "#cli/migration/record";
import { writeCmsMigrationState } from "#cli/migration/state";
import { assertProcessSucceeded, runPnpm, runPnpmCaptureStdout } from "#cli/process/run";
import {
	createD1MigrationArguments,
	createD1MigrationHistoryArguments,
	parseD1MigrationHistory,
	resolveD1MigrationContext,
} from "#cli/project/d1-migrations";
import { createProjectEnvironment } from "#cli/project/environment";

export default class Init extends BaseCommand {
	static override description =
		"Generate the initial migration, optionally apply it to D1, and record its verified baseline";
	static override flags = {
		...commonFlags,
		local: Flags.boolean({
			exclusive: ["remote"],
			description: "Apply the initial migration to the local consumer D1 database",
		}),
		remote: Flags.boolean({
			exclusive: ["local"],
			description: "Apply the initial migration to the remote consumer D1 database",
		}),
	};

	async run(): Promise<void> {
		const { flags } = await this.parse(Init);
		await this.withProjectContext(flags, async ({ paths, config }) => {
			const prepared = await prepareCmsInitialMigration(paths, config);
			if (prepared.kind === "already-recorded") {
				this.log(
					`CMS ${prepared.version} baseline was already recorded. Removed the completed initial migration marker.`,
				);
				return;
			}

			const location = flags.local ? "local" : flags.remote ? "remote" : undefined;
			if (location === undefined) {
				this.log(
					`Prepared the consumer-owned initial migration ${prepared.artifact.fileName} under ${prepared.outputDirectory}. No D1 database was changed. Rerun with --local or --remote to apply it and record the verified baseline.`,
				);
				return;
			}

			const d1Context = await resolveD1MigrationContext(
				paths,
				config,
				flags["wrangler-config"],
				location,
			);
			const environment = createProjectEnvironment(config, paths);
			this.log(
				`Applying initial migration ${prepared.artifact.fileName} to ${location} D1 ${d1Context.databaseName}${d1Context.environmentName ? ` in ${d1Context.environmentName}` : ""}. Wrangler will request confirmation when interactive.`,
			);
			const apply = await runPnpm(
				createD1MigrationArguments("apply", d1Context),
				paths.packageRoot,
				environment,
			);
			assertProcessSucceeded(apply, "wrangler d1 migrations apply", (message, options) =>
				this.error(message, options),
			);

			const history = await runPnpmCaptureStdout(
				createD1MigrationHistoryArguments(d1Context, prepared.artifact.fileName),
				paths.packageRoot,
				environment,
			);
			assertProcessSucceeded(history, "wrangler d1 migration history check", (message, options) =>
				this.error(message, options),
			);
			const appliedMigrationNames = parseD1MigrationHistory(history.stdout);
			if (!appliedMigrationNames.includes(prepared.artifact.fileName)) {
				throw new Error(
					`D1 did not record ${prepared.artifact.fileName} in ${d1Context.migrationsTableName}. The baseline was not advanced; rerun cms migrate init --${location} to retry.`,
				);
			}

			const state = recordCmsBaseline(
				prepared.migration.state,
				prepared.pending.version,
				prepared.migration.catalog,
			);
			await writeCmsMigrationState(prepared.migration.statePath, state);
			await removePendingInitialMigration(prepared.migration.statePath);
			this.log(
				`Applied ${prepared.artifact.fileName} to ${location} D1 ${d1Context.databaseName} and recorded CMS ${prepared.pending.version} (${prepared.pending.schemaId}) as the verified baseline.`,
			);
		});
	}
}
