import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, mkdtempDisposable, readFile, rename, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { withProjectLock } from "./lock.js";

describe("consumer project lock", () => {
	it("reclaims a stale lock from an interrupted local process", async () => {
		await using directory = await mkdtempDisposable(join(tmpdir(), "cms-cli-lock-stale-"));
		const projectRoot = directory.path;
		const lockPath = join(projectRoot, ".cms.lock");
		using child = spawn(process.execPath, ["-e", "setInterval(() => {}, 60000)"], {
			stdio: "ignore",
		});
		const staleProcessId = child.pid;
		if (!staleProcessId) throw new Error("Could not start a lock owner test process.");
		child.kill();
		await once(child, "close");

		await writeFile(
			lockPath,
			`${JSON.stringify({ pid: staleProcessId, hostname: hostname(), token: "interrupted" })}\n`,
		);
		let operationRan = false;

		await withProjectLock(projectRoot, async () => {
			operationRan = true;
			const owner: unknown = JSON.parse(await readFile(lockPath, "utf8"));
			expect(owner).toMatchObject({ pid: process.pid, hostname: hostname() });
		});

		expect(operationRan).toBe(true);
		await expect(access(lockPath)).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("reclaims legacy PID-only locks left by earlier commands", async () => {
		await using directory = await mkdtempDisposable(join(tmpdir(), "cms-cli-lock-legacy-"));
		const projectRoot = directory.path;
		const lockPath = join(projectRoot, ".cms.lock");
		using child = spawn(process.execPath, ["-e", "setInterval(() => {}, 60000)"], {
			stdio: "ignore",
		});
		const staleProcessId = child.pid;
		if (!staleProcessId) throw new Error("Could not start a lock owner test process.");
		child.kill();
		await once(child, "close");

		await writeFile(lockPath, `${staleProcessId}\n`);
		await expect(withProjectLock(projectRoot, async () => undefined)).resolves.toBeUndefined();
		await expect(access(lockPath)).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("keeps a live process lock and reports recovery guidance", async () => {
		await using directory = await mkdtempDisposable(join(tmpdir(), "cms-cli-lock-live-"));
		const projectRoot = directory.path;
		const lockPath = join(projectRoot, ".cms.lock");
		const contents = `${JSON.stringify({ pid: process.pid, hostname: hostname(), token: "active" })}\n`;

		await writeFile(lockPath, contents);
		let operationRan = false;

		await expect(
			withProjectLock(projectRoot, async () => {
				operationRan = true;
			}),
		).rejects.toThrow("Same-host locks from interrupted processes are recovered automatically");

		expect(operationRan).toBe(false);
		expect(await readFile(lockPath, "utf8")).toBe(contents);
	});

	it("does not remove a replacement lock when the previous owner exits", async () => {
		await using directory = await mkdtempDisposable(join(tmpdir(), "cms-cli-lock-replaced-"));
		const lockPath = join(directory.path, ".cms.lock");
		const originalLockPath = `${lockPath}.original`;
		const replacement = { contents: "" };

		await withProjectLock(directory.path, async () => {
			replacement.contents = await readFile(lockPath, "utf8");
			await rename(lockPath, originalLockPath);
			await writeFile(lockPath, replacement.contents);
		});

		expect(await readFile(lockPath, "utf8")).toBe(replacement.contents);
	});

	it("does not remove a changed owner record on the same lock file", async () => {
		await using directory = await mkdtempDisposable(join(tmpdir(), "cms-cli-lock-owner-change-"));
		const lockPath = join(directory.path, ".cms.lock");
		const replacementContents = `${JSON.stringify({
			pid: process.pid,
			hostname: hostname(),
			token: "replacement-owner",
		})}\n`;

		await withProjectLock(directory.path, async () => {
			await writeFile(lockPath, replacementContents);
		});

		expect(await readFile(lockPath, "utf8")).toBe(replacementContents);
	});

	it("leaves an interrupted recovery guard for manual inspection", async () => {
		await using directory = await mkdtempDisposable(join(tmpdir(), "cms-cli-lock-guard-"));
		const lockPath = join(directory.path, ".cms.lock");
		const recoveryGuardPath = `${lockPath}.recovery`;
		const lockContents = `${JSON.stringify({
			pid: process.pid,
			hostname: hostname(),
			token: "interrupted-command",
		})}\n`;
		const guardContents = `${JSON.stringify({
			pid: process.pid,
			hostname: hostname(),
			token: "interrupted-recovery",
		})}\n`;
		await writeFile(lockPath, lockContents);
		await writeFile(recoveryGuardPath, guardContents);

		await expect(withProjectLock(directory.path, async () => undefined)).rejects.toThrow(
			"remove this guard manually before retrying",
		);
		expect(await readFile(lockPath, "utf8")).toBe(lockContents);
		expect(await readFile(recoveryGuardPath, "utf8")).toBe(guardContents);
	});
});
