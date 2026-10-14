import {
	chmod,
	mkdir,
	mkdtempDisposable,
	readFile,
	realpath,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import { describe, expect, it } from "vitest";

import { runMigrationAgent, type MigrationAgentName } from "./adapter.js";

describe("runMigrationAgent", () => {
	it.each(["codex", "claude"] as const)(
		"starts the %s CLI with the prompt as one literal argument in the consumer directory",
		async (agent) => {
			await using directory = await mkdtempDisposable(join(tmpdir(), "cms-agent-adapter-"));
			const binDirectory = join(directory.path, "bin");
			const consumerDirectory = join(directory.path, "consumer");
			const resultPath = join(directory.path, "result.json");
			const prompt = "Prepare migration $(touch should-not-run)\nkeep this prompt intact";

			await mkdir(binDirectory);
			await mkdir(consumerDirectory);
			await createDummyAgent(binDirectory, agent);
			const result = await runMigrationAgent(agent, prompt, consumerDirectory, {
				...process.env,
				PATH: `${binDirectory}${delimiter}${process.env.PATH ?? ""}`,
				CMS_AGENT_RESULT: resultPath,
			});

			expect(result).toEqual({ exitCode: 0, signal: null });
			expect(JSON.parse(await readFile(resultPath, "utf8"))).toEqual({
				argv: [prompt],
				cwd: await realpath(consumerDirectory),
			});
		},
	);

	it("returns the agent's nonzero status without converting it to success", async () => {
		await using directory = await mkdtempDisposable(join(tmpdir(), "cms-agent-exit-"));
		const binDirectory = join(directory.path, "bin");
		await mkdir(binDirectory);
		await createDummyAgent(binDirectory, "codex");
		const result = await runMigrationAgent("codex", "prompt", directory.path, {
			...process.env,
			PATH: `${binDirectory}${delimiter}${process.env.PATH ?? ""}`,
			CMS_AGENT_MODE: "exit",
		});

		expect(result).toEqual({ exitCode: 23, signal: null });
	});

	it("preserves a signal termination from the agent process", async () => {
		await using directory = await mkdtempDisposable(join(tmpdir(), "cms-agent-signal-"));
		const binDirectory = join(directory.path, "bin");
		await mkdir(binDirectory);
		await createDummyAgent(binDirectory, "claude");
		const result = await runMigrationAgent("claude", "prompt", directory.path, {
			...process.env,
			PATH: `${binDirectory}${delimiter}${process.env.PATH ?? ""}`,
			CMS_AGENT_MODE: "signal",
		});

		expect(result).toEqual({ exitCode: 1, signal: "SIGTERM" });
	});

	it("reports a missing installed agent instead of attempting an installation", async () => {
		await using directory = await mkdtempDisposable(join(tmpdir(), "cms-agent-missing-"));
		const binDirectory = join(directory.path, "bin");
		await mkdir(binDirectory);
		await symlink(process.execPath, join(binDirectory, "node"));
		await expect(
			runMigrationAgent("codex", "prompt", directory.path, { PATH: binDirectory }),
		).rejects.toMatchObject({
			message: "Could not start the codex CLI. Install and authenticate it separately, then retry.",
			cause: { code: "ENOENT" },
		});
	});
});

async function createDummyAgent(directory: string, agent: MigrationAgentName): Promise<void> {
	const executablePath = join(directory, agent);
	const source = [
		"#!/usr/bin/env node",
		'import { writeFileSync } from "node:fs";',
		"if (process.env.CMS_AGENT_RESULT) writeFileSync(process.env.CMS_AGENT_RESULT, JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd() }));",
		'if (process.env.CMS_AGENT_MODE === "exit") process.exitCode = 23;',
		'if (process.env.CMS_AGENT_MODE === "signal") process.kill(process.pid, "SIGTERM");',
	].join("\n");
	await writeFile(executablePath, source);
	await chmod(executablePath, 0o755);
}
