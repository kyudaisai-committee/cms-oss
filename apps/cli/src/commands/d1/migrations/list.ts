import { Flags } from "@oclif/core";

import { commonFlags, BaseCommand } from "#cli/base-command";
import { assertProcessSucceeded, runPnpm } from "#cli/process/run";
import { createD1MigrationArguments, resolveD1MigrationContext } from "#cli/project/d1-migrations";
import { createProjectEnvironment } from "#cli/project/environment";

export default class D1MigrationsList extends BaseCommand {
	static override description = "List unapplied migrations in a consumer-owned D1 database";
	static override flags = {
		...commonFlags,
		local: Flags.boolean({
			exclusive: ["remote"],
			description: "Use the local D1 database persisted in the consumer project",
		}),
		remote: Flags.boolean({
			exclusive: ["local"],
			description: "Use the remote D1 database",
		}),
	};

	async run(): Promise<void> {
		const { flags } = await this.parse(D1MigrationsList);
		if (!flags.local && !flags.remote) {
			this.error("Select exactly one D1 target with --local or --remote.");
		}
		const location = flags.local ? "local" : "remote";
		await this.withProjectContext(flags, async ({ paths, config }) => {
			let context: Awaited<ReturnType<typeof resolveD1MigrationContext>>;
			try {
				context = await resolveD1MigrationContext(
					paths,
					config,
					flags["wrangler-config"],
					location,
				);
			} catch (error) {
				if (error instanceof Error) this.error(error.message);
				throw error;
			}

			const environment = createProjectEnvironment(config, paths);
			const args = createD1MigrationArguments("list", context);
			this.log(
				`Listing ${location} migrations for D1 ${context.databaseName} (${context.databaseId})${context.environmentName ? ` in ${context.environmentName}` : ""}; migrations: ${context.drizzleOutputDirectory}; Wrangler config: ${context.wranglerConfigPath}${context.persistTo ? `; local state: ${context.persistTo}` : ""}.`,
			);
			const result = await runPnpm(args, paths.packageRoot, environment);
			assertProcessSucceeded(result, "wrangler d1 migrations list", (message, options) =>
				this.error(message, options),
			);
		});
	}
}
