import { Flags } from "@oclif/core";

import { commonFlags, BaseCommand } from "#cli/base-command";
import { recordCmsBaseline } from "#cli/migration/record";
import { createCmsMigrationContext, writeCmsMigrationState } from "#cli/migration/state";

export default class MarkBaseline extends BaseCommand {
	static override description =
		"Record the verified CMS schema version currently present in the consumer database";
	static override flags = {
		...commonFlags,
		version: Flags.string({
			required: true,
			description: "CMS version whose schema was explicitly verified by the consumer",
		}),
	};

	async run(): Promise<void> {
		const { flags } = await this.parse(MarkBaseline);
		await this.withProjectContext(flags, async ({ paths }) => {
			const context = await createCmsMigrationContext(paths.packageRoot, paths.projectRoot);
			const state = recordCmsBaseline(context.state, flags.version, context.catalog);
			await writeCmsMigrationState(context.statePath, state);
			const baseline = state.baseline;
			if (!baseline) throw new Error("The CMS baseline was not recorded.");
			this.log(
				`Recorded baseline CMS ${baseline.version} (${baseline.schemaId}). This does not apply SQL to any D1 database.`,
			);
		});
	}
}
