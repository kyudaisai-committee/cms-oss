import { createHash } from "node:crypto";
import { access, readFile, readdir, stat } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";

import { createJiti } from "jiti";

interface DrizzleConfigModule {
	default?: unknown;
}

export interface CmsInitialMigrationArtifact {
	fileName: string;
	path: string;
	sha256: string;
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

export async function findCmsInitialMigrationArtifact(
	outputDirectory: string,
	ignoredPaths: string[],
): Promise<CmsInitialMigrationArtifact | undefined> {
	let directoryStat: Awaited<ReturnType<typeof stat>>;
	try {
		directoryStat = await stat(outputDirectory);
	} catch (error) {
		if (hasErrorCode(error, "ENOENT")) return undefined;
		throw error;
	}
	if (!directoryStat.isDirectory()) {
		throw new Error(`The consumer migration output is not a directory: ${outputDirectory}`);
	}

	const ignored = new Set(ignoredPaths.map((path) => resolve(path)));
	const files = (await collectFiles(outputDirectory)).filter((path) => !ignored.has(resolve(path)));
	if (files.length === 0) return undefined;

	const sqlFiles = files.filter((path) => path.endsWith(".sql"));
	const snapshots = files.filter((path) => {
		const relativePath = toRelativeMigrationPath(outputDirectory, path);
		return relativePath.startsWith("meta/") && relativePath.endsWith("_snapshot.json");
	});
	const journalPath = join(outputDirectory, "meta", "_journal.json");
	const journalFiles = files.filter((path) => resolve(path) === resolve(journalPath));
	if (
		sqlFiles.length !== 1 ||
		snapshots.length !== 1 ||
		journalFiles.length !== 1 ||
		files.length !== 3
	) {
		throw new Error(
			`The pending CMS initial migration in ${outputDirectory} is incomplete or contains other migration files. Review the consumer-owned files before retrying; they were not changed.`,
		);
	}

	const fileName = basename(sqlFiles[0]!);
	const tag = fileName.slice(0, -".sql".length);
	const tagMatch = /^(\d+)_cms-initial$/.exec(tag);
	if (!tagMatch) {
		throw new Error(
			`The pending CMS initial migration in ${outputDirectory} does not have the expected Drizzle migration name. Review the consumer-owned files before retrying; they were not changed.`,
		);
	}
	const expectedSnapshotPath = join(outputDirectory, "meta", `${tagMatch[1]}_snapshot.json`);
	if (resolve(snapshots[0]!) !== resolve(expectedSnapshotPath)) {
		throw new Error(
			`The pending CMS initial migration snapshot does not match ${fileName}. Review the consumer-owned files before retrying; they were not changed.`,
		);
	}

	let journal: unknown;
	try {
		journal = JSON.parse(await readFile(journalPath, "utf8"));
	} catch (error) {
		throw new Error(`The pending CMS initial migration journal is invalid: ${journalPath}`, {
			cause: error,
		});
	}
	if (
		!isRecord(journal) ||
		!Array.isArray(journal.entries) ||
		journal.entries.length !== 1 ||
		!isRecord(journal.entries[0]) ||
		journal.entries[0].idx !== 0 ||
		journal.entries[0].tag !== tag
	) {
		throw new Error(
			`The pending CMS initial migration journal does not match ${fileName}. Review the consumer-owned files before retrying; they were not changed.`,
		);
	}

	if ((await stat(sqlFiles[0]!)).size === 0) {
		throw new Error(`The pending CMS initial migration is empty: ${sqlFiles[0]}`);
	}
	const path = sqlFiles[0]!;
	return {
		fileName,
		path,
		sha256: createHash("sha256")
			.update(await readFile(path))
			.digest("hex"),
	};
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

function hasErrorCode(error: unknown, code: string): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
