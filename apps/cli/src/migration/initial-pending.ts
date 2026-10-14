import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const initialMigrationPendingFileName = ".cms-initial-pending.json";

export interface PendingInitialMigration {
	formatVersion: 1;
	version: string;
	schemaId: string;
	migrationFileName: string | null;
	migrationSha256: string | null;
}

export function resolveInitialMigrationPendingPath(statePath: string): string {
	return join(dirname(statePath), initialMigrationPendingFileName);
}

export async function readPendingInitialMigration(
	statePath: string,
): Promise<PendingInitialMigration | undefined> {
	const pendingPath = resolveInitialMigrationPendingPath(statePath);
	let source: string;
	try {
		source = await readFile(pendingPath, "utf8");
	} catch (error) {
		if (hasErrorCode(error, "ENOENT")) return undefined;
		throw error;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(source);
	} catch (error) {
		throw new Error(`The pending initial migration record is not valid JSON: ${pendingPath}`, {
			cause: error,
		});
	}
	if (
		!isRecord(parsed) ||
		parsed.formatVersion !== 1 ||
		typeof parsed.version !== "string" ||
		parsed.version.length === 0 ||
		typeof parsed.schemaId !== "string" ||
		parsed.schemaId.length === 0 ||
		!isInitialMigrationFileName(parsed.migrationFileName) ||
		!isMigrationSha256(parsed.migrationSha256) ||
		(parsed.migrationFileName === null) !== (parsed.migrationSha256 === null)
	) {
		throw new Error(
			`The pending initial migration record has an unsupported format: ${pendingPath}`,
		);
	}
	return {
		formatVersion: 1,
		version: parsed.version,
		schemaId: parsed.schemaId,
		migrationFileName: parsed.migrationFileName,
		migrationSha256: parsed.migrationSha256,
	};
}

export async function createPendingInitialMigration(
	statePath: string,
	pending: PendingInitialMigration,
): Promise<void> {
	const pendingPath = resolveInitialMigrationPendingPath(statePath);
	await mkdir(dirname(pendingPath), { recursive: true });
	await writeFile(pendingPath, `${JSON.stringify(pending, null, 2)}\n`, { flag: "wx" });
}

export async function updatePendingInitialMigration(
	statePath: string,
	pending: PendingInitialMigration,
): Promise<void> {
	const pendingPath = resolveInitialMigrationPendingPath(statePath);
	const temporaryPath = `${pendingPath}.${randomUUID()}.tmp`;
	await writeFile(temporaryPath, `${JSON.stringify(pending, null, 2)}\n`, { flag: "wx" });
	try {
		await rename(temporaryPath, pendingPath);
	} catch (error) {
		await rm(temporaryPath, { force: true });
		throw error;
	}
}

export async function removePendingInitialMigration(statePath: string): Promise<void> {
	await rm(resolveInitialMigrationPendingPath(statePath), { force: true });
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInitialMigrationFileName(value: unknown): value is string | null {
	return value === null || (typeof value === "string" && /^\d+_cms-initial\.sql$/.test(value));
}

function isMigrationSha256(value: unknown): value is string | null {
	return value === null || (typeof value === "string" && /^[\da-f]{64}$/.test(value));
}

function hasErrorCode(error: unknown, code: string): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
