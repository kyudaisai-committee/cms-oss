import { randomUUID } from "node:crypto";
import {
	cp,
	lstat,
	mkdir,
	readdir,
	readFile,
	readlink,
	rename,
	rm,
	rmdir,
	stat,
	writeFile,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";

const manifestName = ".cms-generated.json";

export async function writeGenerationManifest(generatedDirectory: string): Promise<void> {
	const managedPaths = await collectManagedPaths(generatedDirectory);
	managedPaths.push(manifestName);
	managedPaths.sort();
	await writeFile(
		join(generatedDirectory, manifestName),
		`${JSON.stringify({ managedPaths }, null, 2)}\n`,
	);
}

export async function synchronizeGeneratedProject(
	sourceDirectory: string,
	destinationDirectory: string,
): Promise<void> {
	const previousPaths = await readManagedPaths(destinationDirectory);
	const nextPaths = await readManagedPaths(sourceDirectory);
	await cleanSynchronizationTemps(destinationDirectory);
	await synchronizeDirectory(sourceDirectory, destinationDirectory);
	const nextPathSet = new Set(nextPaths);
	const obsoletePaths = previousPaths
		.filter((path) => !nextPathSet.has(path))
		.sort((left, right) => right.split("/").length - left.split("/").length);
	for (const path of obsoletePaths) {
		await removeManagedPath(destinationDirectory, path);
	}
}

export async function recoverInterruptedGeneration(cmsDirectory: string): Promise<void> {
	const parentDirectory = dirname(cmsDirectory);
	const directoryName = basename(cmsDirectory);
	const temporaryPrefix = `${directoryName}.tmp-`;
	const backupPrefix = `${directoryName}.old-`;
	const entries = await readdir(parentDirectory, { withFileTypes: true }).catch(
		(error: unknown) => {
			if (hasErrorCode(error, "ENOENT")) return [];
			throw error;
		},
	);
	const temporaryDirectories = entries
		.filter((entry) => entry.isDirectory() && entry.name.startsWith(temporaryPrefix))
		.map((entry) => join(parentDirectory, entry.name));
	const backupDirectories = entries
		.filter((entry) => entry.isDirectory() && entry.name.startsWith(backupPrefix))
		.map((entry) => join(parentDirectory, entry.name));
	const cmsExists = await lstat(cmsDirectory)
		.then(() => true)
		.catch((error: unknown) => {
			if (hasErrorCode(error, "ENOENT")) return false;
			throw error;
		});

	if (!cmsExists && backupDirectories.length > 0) {
		const backupsByTime = await Promise.all(
			backupDirectories.map(async (path) => ({ path, modifiedAt: (await stat(path)).mtimeMs })),
		);
		backupsByTime.sort((left, right) => right.modifiedAt - left.modifiedAt);
		const latestBackup = backupsByTime[0];
		if (latestBackup) {
			await rename(latestBackup.path, cmsDirectory);
			backupDirectories.splice(backupDirectories.indexOf(latestBackup.path), 1);
		}
	}

	await Promise.all(
		[...temporaryDirectories, ...backupDirectories].map((path) =>
			rm(path, { recursive: true, force: true }),
		),
	);
}

async function collectManagedPaths(directory: string, parentPath = ""): Promise<string[]> {
	const paths: string[] = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const relativePath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
		paths.push(relativePath);
		if (entry.isDirectory()) {
			paths.push(...(await collectManagedPaths(join(directory, entry.name), relativePath)));
		}
	}
	return paths;
}

async function readManagedPaths(directory: string): Promise<string[]> {
	try {
		const parsed: unknown = JSON.parse(await readFile(join(directory, manifestName), "utf8"));
		if (typeof parsed !== "object" || parsed === null || !("managedPaths" in parsed)) return [];
		if (!Array.isArray(parsed.managedPaths)) return [];
		return parsed.managedPaths.filter(isSafeRelativePath);
	} catch {
		return [];
	}
}

function isSafeRelativePath(value: unknown): value is string {
	if (typeof value !== "string" || value.length === 0 || value.includes("\\")) return false;
	const segments = value.split("/");
	return (
		!value.startsWith("/") &&
		segments.every((segment) => segment !== "" && segment !== "." && segment !== "..")
	);
}

async function cleanSynchronizationTemps(directory: string): Promise<void> {
	for (const entry of await readdir(directory, { withFileTypes: true }).catch((error: unknown) => {
		if (hasErrorCode(error, "ENOENT")) return [];
		throw error;
	})) {
		const path = join(directory, entry.name);
		if (entry.name.startsWith(".cms-sync-")) {
			await rm(path, { recursive: true, force: true });
		} else if (entry.isDirectory()) {
			await cleanSynchronizationTemps(path);
		}
	}
}

async function synchronizeDirectory(source: string, destination: string): Promise<void> {
	await mkdir(destination, { recursive: true });
	for (const entry of await readdir(source, { withFileTypes: true })) {
		await synchronizeEntry(join(source, entry.name), join(destination, entry.name));
	}
}

async function synchronizeEntry(source: string, destination: string): Promise<void> {
	const sourceInfo = await lstat(source);
	const destinationInfo = await lstat(destination).catch((error: unknown) => {
		if (hasErrorCode(error, "ENOENT")) return undefined;
		throw error;
	});

	if (destinationInfo) {
		if (sourceInfo.isDirectory() && destinationInfo.isDirectory()) {
			await synchronizeDirectory(source, destination);
			return;
		}
		if (sourceInfo.isSymbolicLink() && destinationInfo.isSymbolicLink()) {
			if ((await readlink(source)) === (await readlink(destination))) return;
		} else if (sourceInfo.isFile() && destinationInfo.isFile()) {
			const [sourceContents, destinationContents] = await Promise.all([
				readFile(source),
				readFile(destination),
			]);
			if (sourceContents.equals(destinationContents)) return;
		}
	}

	const temporaryPath = join(dirname(destination), `.cms-sync-${randomUUID()}`);
	await cp(source, temporaryPath, {
		recursive: true,
		dereference: false,
		preserveTimestamps: true,
	});
	if (destinationInfo) await rm(destination, { recursive: true, force: true });
	await rename(temporaryPath, destination);
}

async function removeManagedPath(root: string, relativePath: string): Promise<void> {
	if (!isSafeRelativePath(relativePath)) return;
	const path = join(root, ...relativePath.split("/"));
	const entry = await lstat(path).catch((error: unknown) => {
		if (hasErrorCode(error, "ENOENT")) return undefined;
		throw error;
	});
	if (!entry) return;
	if (entry.isDirectory() && !entry.isSymbolicLink()) {
		await rmdir(path).catch((error: unknown) => {
			if (!hasErrorCode(error, "ENOTEMPTY") && !hasErrorCode(error, "EEXIST")) throw error;
		});
		return;
	}
	await rm(path, { force: true });
}

function hasErrorCode(error: unknown, code: string): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
