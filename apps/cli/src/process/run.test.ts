import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runCommand } from "./run.js";

describe("runCommand", () => {
	it("passes arguments literally and preserves the child exit code", async () => {
		const directory = await mkdtemp(join(tmpdir(), "cms-cli-process-"));
		const resultPath = join(directory, "arguments.json");
		const argumentsToPass = ["argument with spaces", "$(not-a-shell-command)"];
		const script = [
			'import { writeFileSync } from "node:fs";',
			`writeFileSync(process.argv[1], JSON.stringify(process.argv.slice(2)));`,
			"process.exitCode = 7;",
		].join("\n");

		try {
			const result = await runCommand(
				process.execPath,
				["--input-type=module", "-e", script, resultPath, ...argumentsToPass],
				directory,
				process.env,
			);

			expect(result).toEqual({ exitCode: 7, signal: null });
			expect(JSON.parse(await readFile(resultPath, "utf8"))).toEqual(argumentsToPass);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
