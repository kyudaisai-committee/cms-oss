import { randomUUID } from "node:crypto";
import { access, link, open, readFile, rename, rm } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";

interface LockOwner {
	pid: number;
	hostname: string;
	token?: string;
}

export async function withProjectLock<T>(
	projectRoot: string,
	operation: () => Promise<T>,
): Promise<T> {
	const lockPath = join(projectRoot, ".cms.lock");
	const { lockHandle } = await acquireLock(lockPath);
	try {
		return await operation();
	} finally {
		await lockHandle.close();
		await rm(lockPath, { force: true });
	}
}

async function acquireLock(lockPath: string): Promise<{ lockHandle: FileHandle }> {
	for (let attempt = 0; attempt < 2; attempt += 1) {
		let lockHandle: FileHandle;
		try {
			lockHandle = await open(lockPath, "wx");
		} catch (error) {
			if (!hasErrorCode(error, "EEXIST")) throw error;
			if (await recoverStaleLock(lockPath)) continue;
			throw await createLockError(lockPath);
		}

		const owner: LockOwner = {
			pid: process.pid,
			hostname: hostname(),
			token: randomUUID(),
		};
		try {
			await lockHandle.writeFile(`${JSON.stringify(owner)}\n`);
			return { lockHandle };
		} catch (error) {
			await lockHandle.close();
			await rm(lockPath, { force: true });
			throw error;
		}
	}
	throw await createLockError(lockPath);
}

async function recoverStaleLock(lockPath: string): Promise<boolean> {
	const owner = await readLockOwner(lockPath);
	if (!owner) {
		try {
			await access(lockPath);
			return false;
		} catch (error) {
			if (hasErrorCode(error, "ENOENT")) return true;
			throw error;
		}
	}
	if (owner.hostname !== hostname() || isProcessAlive(owner.pid)) return false;

	const recoveryPath = `${lockPath}.stale-${randomUUID()}`;
	try {
		await rename(lockPath, recoveryPath);
	} catch (error) {
		if (hasErrorCode(error, "ENOENT")) return true;
		throw error;
	}

	const recoveredOwner = await readLockOwner(recoveryPath);
	if (
		recoveredOwner &&
		areSameOwners(owner, recoveredOwner) &&
		recoveredOwner.hostname === hostname() &&
		!isProcessAlive(recoveredOwner.pid)
	) {
		await rm(recoveryPath, { force: true });
		return true;
	}

	try {
		await link(recoveryPath, lockPath);
		await rm(recoveryPath, { force: true });
	} catch (error) {
		if (hasErrorCode(error, "EEXIST")) {
			throw new Error(
				`The CMS lock changed during recovery. Inspect ${lockPath} and ${recoveryPath} before retrying.`,
			);
		}
		throw error;
	}
	return false;
}

async function readLockOwner(lockPath: string): Promise<LockOwner | undefined> {
	const contents = await readFile(lockPath, "utf8").catch((error: unknown) => {
		if (hasErrorCode(error, "ENOENT")) return undefined;
		throw error;
	});
	if (contents === undefined) return undefined;
	const legacyPid = /^\d+$/.test(contents.trim()) ? Number(contents.trim()) : undefined;
	if (legacyPid && Number.isSafeInteger(legacyPid) && legacyPid > 0) {
		return { pid: legacyPid, hostname: hostname() };
	}
	try {
		const parsed: unknown = JSON.parse(contents);
		if (isLockOwner(parsed)) return parsed;
	} catch {
		return undefined;
	}
	return undefined;
}

function isLockOwner(value: unknown): value is LockOwner {
	return (
		typeof value === "object" &&
		value !== null &&
		"pid" in value &&
		typeof value.pid === "number" &&
		Number.isSafeInteger(value.pid) &&
		value.pid > 0 &&
		"hostname" in value &&
		typeof value.hostname === "string" &&
		("token" in value ? typeof value.token === "string" : true)
	);
}

function areSameOwners(left: LockOwner, right: LockOwner): boolean {
	return left.pid === right.pid && left.hostname === right.hostname && left.token === right.token;
}

function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return !hasErrorCode(error, "ESRCH");
	}
}

async function createLockError(lockPath: string): Promise<Error> {
	const owner = await readLockOwner(lockPath);
	const ownerDescription = owner
		? ` (PID ${owner.pid} on ${owner.hostname})`
		: " with an unreadable owner record";
	return new Error(
		`Another CMS command is using this project${ownerDescription}. Wait for it to finish. Same-host locks from interrupted processes are recovered automatically; for an unreadable or remote lock, confirm no command is running and remove ${lockPath} before retrying.`,
	);
}

function hasErrorCode(error: unknown, code: string): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
