import { access, readdir, stat } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

import { createJiti } from "jiti";

interface DrizzleConfigModule {
	default?: unknown;
}

export async function resolveDrizzleOutputDirectory(configPath: string): Promise<string> {
	let configModule: DrizzleConfigModule;
	try {
		configModule = await createJiti(configPath, { moduleCache: false }).import<DrizzleConfigModule>(
			configPath,
		);
	} catch (error) {
		throw new Error(`Could not load Drizzle configuration at ${configPath}.`, { cause: error });
	}
	if (!isRecord(configModule.default)) {
		throw new Error(`The Drizzle configuration must export an object: ${configPath}`);
	}
	const outputDirectory = configModule.default.out ?? "./drizzle";
	if (typeof outputDirectory !== "string" || outputDirectory.length === 0) {
		throw new Error(`The Drizzle configuration must set out to a directory path: ${configPath}`);
	}
	return resolve(dirname(configPath), outputDirectory);
}

export async function assertInitialMigrationDirectoryIsEmpty(
	outputDirectory: string,
	statePath: string,
): Promise<void> {
	const entries = await readdir(outputDirectory).catch((error: unknown) => {
		if (hasErrorCode(error, "ENOENT")) return [];
		throw error;
	});
	const stateExists = await isFile(statePath);
	if (entries.length > 0 || stateExists) {
		throw new Error(
			`Refusing to initialize CMS migrations because ${outputDirectory} or ${statePath} already contains consumer data. Review the existing Drizzle history and do not rerun initial generation over it.`,
		);
	}
}

export async function assertInitialMigrationArtifactsExist(outputDirectory: string): Promise<void> {
	const files = await collectFiles(outputDirectory);
	const sqlFiles = files.filter((path) => path.endsWith(".sql"));
	const snapshots = files.filter(
		(path) =>
			toRelativeMigrationPath(outputDirectory, path).startsWith("meta/") &&
			path.endsWith("_snapshot.json"),
	);
	const journalExists = files.some(
		(path) => toRelativeMigrationPath(outputDirectory, path) === "meta/_journal.json",
	);
	if (sqlFiles.length === 0 || snapshots.length === 0 || !journalExists) {
		throw new Error(
			`Drizzle Kit did not create the expected SQL, snapshot, and journal under ${outputDirectory}. Inspect the output before retrying.`,
		);
	}
	for (const sqlPath of sqlFiles) {
		if ((await stat(sqlPath)).size > 0) return;
	}
	throw new Error(`Drizzle Kit generated no SQL statements under ${outputDirectory}.`);
}

function toRelativeMigrationPath(outputDirectory: string, filePath: string): string {
	return relative(outputDirectory, filePath).replaceAll("\\", "/");
}

async function collectFiles(directory: string): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) files.push(...(await collectFiles(path)));
		else if (entry.isFile()) files.push(path);
	}
	return files;
}

async function isFile(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch (error) {
		if (hasErrorCode(error, "ENOENT")) return false;
		throw error;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasErrorCode(error: unknown, code: string): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
