import { commonFlags, BaseCommand } from "#cli/base-command";

export default class Init extends BaseCommand {
	static override description = "Prepare the CMS Waku launch directory";
	static override flags = commonFlags;

	async run(): Promise<void> {
		const { flags } = await this.parse(Init);
		await this.withProject(flags, async ({ paths }) => {
			this.log(
				`Prepared ${paths.cmsDirectory}. Consumer configuration and migration files remain in ${paths.projectRoot}.`,
			);
		});
	}
}
