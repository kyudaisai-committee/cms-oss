import { Command, Flags } from "@oclif/core";

import { loadCmsConfig } from "#cli/project/config";
import { generateCmsProject } from "#cli/project/generate";
import { withProjectLock } from "#cli/project/lock";
import { resolveProjectPaths, type ProjectPaths } from "#cli/project/paths";

export const commonFlags = {
	cwd: Flags.string({ description: "Consumer project directory" }),
	config: Flags.string({ description: "Path to cms.config.ts, relative to --cwd" }),
	"wrangler-config": Flags.string({
		description:
			"Path to the consumer's existing Wrangler configuration, relative to the directory containing cms.config.ts",
	}),
	env: Flags.string({ description: "Named Cloudflare environment" }),
};

export interface ProjectFlags {
	cwd?: string | undefined;
	config?: string | undefined;
	"wrangler-config"?: string | undefined;
	env?: string | undefined;
}

export interface ProjectContext {
	paths: ProjectPaths;
	config: Awaited<ReturnType<typeof loadCmsConfig>>;
}

export abstract class BaseCommand extends Command {
	static override flags = commonFlags;

	protected async withProject<T>(
		flags: ProjectFlags,
		operation: (context: ProjectContext) => Promise<T>,
	): Promise<T> {
		return this.withProjectContext(flags, async (context) => {
			await generateCmsProject(context.paths);
			return operation(context);
		});
	}

	protected async withProjectContext<T>(
		flags: ProjectFlags,
		operation: (context: ProjectContext) => Promise<T>,
	): Promise<T> {
		const paths = resolveProjectPaths(flags.cwd ?? process.cwd(), flags.config);
		return withProjectLock(paths.projectRoot, async () => {
			const loadedConfig = await loadCmsConfig(paths.configPath, flags.env);
			return operation({ paths, config: loadedConfig });
		});
	}
}
