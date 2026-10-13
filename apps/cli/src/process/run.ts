import { spawn } from "node:child_process";

export interface ProcessResult {
	exitCode: number;
	signal: NodeJS.Signals | null;
}

export async function runCommand(
	command: string,
	args: string[],
	cwd: string,
	env: NodeJS.ProcessEnv,
): Promise<ProcessResult> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd,
			env,
			stdio: "inherit",
			shell: false,
		});
		const forwardSignal = (signal: NodeJS.Signals) => {
			child.kill(signal);
		};
		const handleInterrupt = () => forwardSignal("SIGINT");
		const handleTermination = () => forwardSignal("SIGTERM");
		process.on("SIGINT", handleInterrupt);
		process.on("SIGTERM", handleTermination);

		child.once("error", (error) => {
			process.off("SIGINT", handleInterrupt);
			process.off("SIGTERM", handleTermination);
			reject(error);
		});
		child.once("close", (code, signal) => {
			process.off("SIGINT", handleInterrupt);
			process.off("SIGTERM", handleTermination);
			resolve({ exitCode: code ?? 1, signal });
		});
	});
}

export function runPnpm(
	args: string[],
	cwd: string,
	env: NodeJS.ProcessEnv,
): Promise<ProcessResult> {
	return runCommand("pnpm", ["exec", ...args], cwd, env);
}

export function assertProcessSucceeded(
	result: ProcessResult,
	command: string,
	showError: (message: string, options: { exit: number }) => never,
): void {
	if (result.exitCode !== 0) {
		const status = result.signal ? `signal ${result.signal}` : `exit code ${result.exitCode}`;
		showError(`${command} failed with ${status}.`, { exit: result.exitCode });
	}
}
