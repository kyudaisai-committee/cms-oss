import { Flags } from "@oclif/core";

import { runMigrationAgent, type MigrationAgentName } from "#cli/agents/adapter";
import { commonFlags, BaseCommand } from "#cli/base-command";
import { resolveDrizzleOutputDirectory } from "#cli/migration/initial-ddl";
import { createCmsMigrationPlan, formatCmsMigrationPlan } from "#cli/migration/plan";
import { createCmsMigrationPrompt } from "#cli/migration/prompt";
import { createCmsMigrationContext } from "#cli/migration/state";
import { assertProcessSucceeded } from "#cli/process/run";

export default class Migrate extends BaseCommand {
	static override description = "Review database changes for the installed CMS version";
	static override flags = {
		...commonFlags,
		codex: Flags.boolean({
			exclusive: ["claude"],
			description: "Start the installed Codex CLI to prepare consumer-owned migration files",
		}),
		claude: Flags.boolean({
			exclusive: ["codex"],
			description: "Start the installed Claude CLI to prepare consumer-owned migration files",
		}),
	};

	async run(): Promise<void> {
		const { flags } = await this.parse(Migrate);
		await this.withProjectContext(flags, async ({ paths }) => {
			const context = await createCmsMigrationContext(paths.packageRoot, paths.projectRoot);
			const plan = createCmsMigrationPlan(context.state, context.catalog);
			const agent: MigrationAgentName | undefined = flags.codex
				? "codex"
				: flags.claude
					? "claude"
					: undefined;
			if (!agent || plan.kind !== "changes") {
				this.log(formatCmsMigrationPlan(plan));
				return;
			}

			const migrationsDirectory = await resolveDrizzleOutputDirectory(paths.drizzleConfigPath);
			const prompt = createCmsMigrationPrompt({
				plan,
				schemaExport: context.catalog.current.schemaExport,
				configPath: paths.configPath,
				drizzleConfigPath: paths.drizzleConfigPath,
				migrationsDirectory,
			});
			this.log(`Starting the installed ${agent} CLI in ${paths.projectRoot}.`);
			let result: Awaited<ReturnType<typeof runMigrationAgent>>;
			try {
				result = await runMigrationAgent(agent, prompt, paths.projectRoot, process.env);
			} catch (error) {
				if (error instanceof Error) this.error(error.message);
				throw error;
			}
			assertProcessSucceeded(result, `${agent} CLI`, (message, options) =>
				this.error(message, options),
			);
			this.log(
				`Review the consumer-owned migration files, then record them explicitly with cms migrate mark-prepared --version ${plan.to.version}.`,
			);
		});
	}
}
