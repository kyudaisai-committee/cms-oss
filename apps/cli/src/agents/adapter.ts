import { runCommand, type ProcessResult } from "#cli/process/run";

export type MigrationAgentName = "codex" | "claude";

export function runMigrationAgent(
	agent: MigrationAgentName,
	prompt: string,
	cwd: string,
	env: NodeJS.ProcessEnv,
): Promise<ProcessResult> {
	return runCommand(agent, [prompt], cwd, env).catch((error: unknown) => {
		if (!hasErrorCode(error, "ENOENT")) throw error;
		throw new Error(
			`Could not start the ${agent} CLI. Install and authenticate it separately, then retry.`,
			{ cause: error },
		);
	});
}

function hasErrorCode(error: unknown, code: string): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
