import { commonFlags, BaseCommand } from "#cli/base-command";
import { createCmsMigrationPlan, formatCmsMigrationPlan } from "#cli/migration/plan";
import { createCmsMigrationContext } from "#cli/migration/state";

export default class Migrate extends BaseCommand {
	static override description = "Review database changes for the installed CMS version";
	static override flags = commonFlags;

	async run(): Promise<void> {
		const { flags } = await this.parse(Migrate);
		await this.withProjectContext(flags, async ({ paths }) => {
			const context = await createCmsMigrationContext(paths.packageRoot, paths.projectRoot);
			this.log(formatCmsMigrationPlan(createCmsMigrationPlan(context.state, context.catalog)));
		});
	}
}
