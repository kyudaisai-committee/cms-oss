import { mkdtempDisposable, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runCommand, runCommandCaptureStdout } from "./run.js";

describe("runCommand", () => {
	it("passes arguments literally and preserves the child exit code", async () => {
		await using directory = await mkdtempDisposable(join(tmpdir(), "cms-cli-process-"));
		const resultPath = join(directory.path, "arguments.json");
		const argumentsToPass = ["argument with spaces", "$(not-a-shell-command)"];
		const script = [
			'import { writeFileSync } from "node:fs";',
			`writeFileSync(process.argv[1], JSON.stringify(process.argv.slice(2)));`,
			"process.exitCode = 7;",
		].join("\n");

		const result = await runCommand(
			process.execPath,
			["--input-type=module", "-e", script, resultPath, ...argumentsToPass],
			directory.path,
			process.env,
		);

		expect(result).toEqual({ exitCode: 7, signal: null });
		expect(JSON.parse(await readFile(resultPath, "utf8"))).toEqual(argumentsToPass);
	});

	it("captures stdout while preserving the child exit code", async () => {
		await using directory = await mkdtempDisposable(join(tmpdir(), "cms-cli-process-capture-"));
		const result = await runCommandCaptureStdout(
			process.execPath,
			["--input-type=module", "-e", 'process.stdout.write("captured output");'],
			directory.path,
			process.env,
		);

		expect(result).toEqual({ exitCode: 0, signal: null, stdout: "captured output" });
	});
});
