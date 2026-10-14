import { Flags } from "@oclif/core";

import { commonFlags, BaseCommand } from "#cli/base-command";
import { recordCmsPreparedThrough } from "#cli/migration/record";
import { createCmsMigrationContext, writeCmsMigrationState } from "#cli/migration/state";

export default class MarkPrepared extends BaseCommand {
	static override description =
		"Record the CMS version through which consumer-owned migrations were prepared and reviewed";
	static override flags = {
		...commonFlags,
		version: Flags.string({
			required: true,
			description: "CMS version through which the consumer migration files were prepared",
		}),
	};

	async run(): Promise<void> {
		const { flags } = await this.parse(MarkPrepared);
		await this.withProjectContext(flags, async ({ paths }) => {
			const context = await createCmsMigrationContext(paths.packageRoot, paths.projectRoot);
			const state = recordCmsPreparedThrough(context.state, flags.version, context.catalog);
			await writeCmsMigrationState(context.statePath, state);
			const preparedThrough = state.preparedThrough;
			if (!preparedThrough) throw new Error("The prepared migration version was not recorded.");
			this.log(
				`Recorded migrations prepared through CMS ${preparedThrough.version} (${preparedThrough.schemaId}). This does not record D1 application.`,
			);
		});
	}
}
