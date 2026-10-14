import { spawn } from "node:child_process";

export interface ProcessResult {
	exitCode: number;
	signal: NodeJS.Signals | null;
}

export interface CapturedProcessResult extends ProcessResult {
	stdout: string;
}

export async function runCommand(
	command: string,
	args: string[],
	cwd: string,
	env: NodeJS.ProcessEnv,
): Promise<ProcessResult> {
	const result = await spawnCommand(command, args, cwd, env, false);
	return { exitCode: result.exitCode, signal: result.signal };
}

export async function runCommandCaptureStdout(
	command: string,
	args: string[],
	cwd: string,
	env: NodeJS.ProcessEnv,
): Promise<CapturedProcessResult> {
	const result = await spawnCommand(command, args, cwd, env, true);
	return { exitCode: result.exitCode, signal: result.signal, stdout: result.stdout ?? "" };
}

function spawnCommand(
	command: string,
	args: string[],
	cwd: string,
	env: NodeJS.ProcessEnv,
	captureStdout: boolean,
): Promise<ProcessResult & { stdout?: string }> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd,
			env,
			stdio: captureStdout ? ["inherit", "pipe", "inherit"] : "inherit",
			shell: false,
		});
		const stdoutChunks: string[] = [];
		if (captureStdout) {
			child.stdout?.setEncoding("utf8");
			child.stdout?.on("data", (chunk: string) => stdoutChunks.push(chunk));
		}
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
			resolve({
				exitCode: code ?? 1,
				signal,
				...(captureStdout ? { stdout: stdoutChunks.join("") } : {}),
			});
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

export function runPnpmCaptureStdout(
	args: string[],
	cwd: string,
	env: NodeJS.ProcessEnv,
): Promise<CapturedProcessResult> {
	return runCommandCaptureStdout("pnpm", ["exec", ...args], cwd, env);
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
