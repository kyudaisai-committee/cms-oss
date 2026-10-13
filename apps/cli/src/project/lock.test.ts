import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { withProjectLock } from "./lock.js";

describe("consumer project lock", () => {
	it("reclaims a stale lock from an interrupted local process", async () => {
		const projectRoot = await mkdtemp(join(tmpdir(), "cms-cli-lock-stale-"));
		const lockPath = join(projectRoot, ".cms.lock");
		const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 60000)"], {
			stdio: "ignore",
		});
		const staleProcessId = child.pid;
		if (!staleProcessId) throw new Error("Could not start a lock owner test process.");
		child.kill();
		await once(child, "close");

		try {
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
		} finally {
			await rm(projectRoot, { recursive: true, force: true });
		}
	});

	it("reclaims legacy PID-only locks left by earlier commands", async () => {
		const projectRoot = await mkdtemp(join(tmpdir(), "cms-cli-lock-legacy-"));
		const lockPath = join(projectRoot, ".cms.lock");
		const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 60000)"], {
			stdio: "ignore",
		});
		const staleProcessId = child.pid;
		if (!staleProcessId) throw new Error("Could not start a lock owner test process.");
		child.kill();
		await once(child, "close");

		try {
			await writeFile(lockPath, `${staleProcessId}\n`);
			await expect(withProjectLock(projectRoot, async () => undefined)).resolves.toBeUndefined();
			await expect(access(lockPath)).rejects.toMatchObject({ code: "ENOENT" });
		} finally {
			await rm(projectRoot, { recursive: true, force: true });
		}
	});

	it("keeps a live process lock and reports recovery guidance", async () => {
		const projectRoot = await mkdtemp(join(tmpdir(), "cms-cli-lock-live-"));
		const lockPath = join(projectRoot, ".cms.lock");
		const contents = `${JSON.stringify({ pid: process.pid, hostname: hostname(), token: "active" })}\n`;

		try {
			await writeFile(lockPath, contents);
			let operationRan = false;

			await expect(
				withProjectLock(projectRoot, async () => {
					operationRan = true;
				}),
			).rejects.toThrow("Same-host locks from interrupted processes are recovered automatically");

			expect(operationRan).toBe(false);
			expect(await readFile(lockPath, "utf8")).toBe(contents);
		} finally {
			await rm(projectRoot, { recursive: true, force: true });
		}
	});
});
