import { randomUUID } from "node:crypto";
import { access, link, lstat, open, readFile, rename, rm } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";

interface LockOwner {
	pid: number;
	hostname: string;
	token?: string;
}

interface HeldLock {
	lockHandle: FileHandle;
	owner: LockOwner;
}

export async function withProjectLock<T>(
	projectRoot: string,
	operation: () => Promise<T>,
): Promise<T> {
	const lockPath = join(projectRoot, ".cms.lock");
	const { lockHandle, owner } = await acquireLock(lockPath);
	await using heldLockHandle = lockHandle;
	try {
		return await operation();
	} finally {
		await removeLockOwnedByHandle(lockPath, heldLockHandle, owner);
	}
}

async function acquireLock(lockPath: string): Promise<HeldLock> {
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
			return { lockHandle, owner };
		} catch (error) {
			await using failedLockHandle = lockHandle;
			await removeLockOwnedByHandle(lockPath, failedLockHandle);
			throw error;
		}
	}
	throw await createLockError(lockPath);
}

async function recoverStaleLock(lockPath: string): Promise<boolean> {
	const guardPath = `${lockPath}.recovery`;
	const guardOwner: LockOwner = {
		pid: process.pid,
		hostname: hostname(),
		token: randomUUID(),
	};
	let guardHandle: FileHandle;
	try {
		guardHandle = await open(guardPath, "wx");
	} catch (error) {
		if (hasErrorCode(error, "EEXIST")) {
			throw new Error(
				`CMS lock recovery is already running or was interrupted. Inspect ${guardPath}; if no recovery is running, remove this guard manually before retrying.`,
				{ cause: error },
			);
		}
		throw error;
	}
	await using recoveryGuardHandle = guardHandle;
	try {
		await recoveryGuardHandle.writeFile(`${JSON.stringify(guardOwner)}\n`);
	} catch (error) {
		await removeLockOwnedByHandle(guardPath, recoveryGuardHandle);
		throw error;
	}

	try {
		const owner = await readLockOwner(lockPath);
		if (!owner) return await isMissing(lockPath);
		if (owner.hostname !== hostname() || isProcessAlive(owner.pid)) return false;

		const recoveryPath = `${lockPath}.stale-${randomUUID()}`;
		try {
			await rename(lockPath, recoveryPath);
		} catch (error) {
			if (hasErrorCode(error, "ENOENT")) return true;
			throw error;
		}

		let recoveredOwner: LockOwner | undefined;
		try {
			recoveredOwner = await readLockOwner(recoveryPath);
		} catch (error) {
			await restoreRecoveredLock(recoveryPath, lockPath);
			throw error;
		}
		if (
			recoveredOwner &&
			areSameOwners(owner, recoveredOwner) &&
			recoveredOwner.hostname === hostname() &&
			!isProcessAlive(recoveredOwner.pid)
		) {
			try {
				await rm(recoveryPath, { force: true });
				return true;
			} catch (error) {
				await restoreRecoveredLock(recoveryPath, lockPath);
				throw error;
			}
		}

		await restoreRecoveredLock(recoveryPath, lockPath);
		return false;
	} finally {
		await removeLockOwnedByHandle(guardPath, recoveryGuardHandle, guardOwner);
	}
}

async function restoreRecoveredLock(recoveryPath: string, lockPath: string): Promise<void> {
	try {
		await link(recoveryPath, lockPath);
		await rm(recoveryPath, { force: true });
	} catch (error) {
		if (hasErrorCode(error, "EEXIST")) {
			throw new Error(
				`The CMS lock changed during recovery. Inspect ${lockPath} and ${recoveryPath} before retrying.`,
				{ cause: error },
			);
		}
		throw error;
	}
}

async function isMissing(path: string): Promise<boolean> {
	try {
		await access(path);
		return false;
	} catch (error) {
		if (hasErrorCode(error, "ENOENT")) return true;
		throw error;
	}
}

async function removeLockOwnedByHandle(
	lockPath: string,
	lockHandle: FileHandle,
	expectedOwner?: LockOwner,
): Promise<void> {
	const handleInfo = await lockHandle.stat();
	const pathInfo = await lstat(lockPath).catch((error: unknown) => {
		if (hasErrorCode(error, "ENOENT")) return undefined;
		throw error;
	});
	if (!pathInfo || !areSameFiles(pathInfo, handleInfo)) return;

	if (expectedOwner) {
		const pathOwner = await readLockOwner(lockPath);
		if (!pathOwner || !areSameOwners(expectedOwner, pathOwner)) return;
	}

	const currentPathInfo = await lstat(lockPath).catch((error: unknown) => {
		if (hasErrorCode(error, "ENOENT")) return undefined;
		throw error;
	});
	if (!currentPathInfo || !areSameFiles(currentPathInfo, handleInfo)) return;
	await rm(lockPath, { force: true });
}

function areSameFiles(
	left: { dev: number; ino: number },
	right: { dev: number; ino: number },
): boolean {
	return left.dev === right.dev && left.ino === right.ino;
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
