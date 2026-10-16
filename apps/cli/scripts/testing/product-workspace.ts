import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cp, lstat, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const excludedDirectories = new Set([".git", "coverage", "dist", "node_modules"]);
const excludedTestSuffixes = [
	".test.ts",
	".test.tsx",
	".test.js",
	".test.jsx",
	".spec.ts",
	".spec.tsx",
];

export async function prepareProductWorkspace(
	repositoryRoot: string,
	workspaceDirectory: string,
): Promise<void> {
	await mkdir(workspaceDirectory, { recursive: true });
	const files = listWorkingTreeFiles(repositoryRoot);
	for (const file of files) {
		if (!shouldSnapshotFile(file)) continue;
		const source = path.join(repositoryRoot, file);
		try {
			await lstat(source);
		} catch (error) {
			if (isMissingFile(error)) continue;
			throw error;
		}
		const destination = path.join(workspaceDirectory, file);
		await mkdir(path.dirname(destination), { recursive: true });
		await cp(source, destination, { verbatimSymlinks: true });
	}
	runPnpm(["install", "--frozen-lockfile", "--ignore-scripts"], workspaceDirectory);
}

export async function addProductVersionChangesetFixture(workspaceDirectory: string): Promise<void> {
	const changesetDirectory = path.join(workspaceDirectory, ".changeset");
	await mkdir(changesetDirectory, { recursive: true });
	await writeFile(
		path.join(changesetDirectory, `product-consumer-${randomUUID()}.md`),
		'---\n"@repo/cli": patch\n---\n\nExercise the isolated product version pipeline.\n',
	);
}

export function runPnpm(arguments_: string[], cwd: string): void {
	const result = spawnSync("pnpm", arguments_, {
		cwd,
		encoding: "utf8",
		maxBuffer: 32 * 1024 * 1024,
		timeout: 10 * 60 * 1_000,
		shell: false,
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(
			`pnpm ${arguments_.join(" ")} failed in ${cwd}:\n${result.stdout}\n${result.stderr}`,
		);
	}
}

function listWorkingTreeFiles(repositoryRoot: string): string[] {
	const result = spawnSync(
		"git",
		["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
		{ cwd: repositoryRoot, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, shell: false },
	);
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(`git ls-files failed in ${repositoryRoot}:\n${result.stderr}`);
	}
	return result.stdout.split("\0").filter(Boolean);
}

function shouldSnapshotFile(file: string): boolean {
	const normalizedPath = file.replaceAll("\\", "/");
	const segments = normalizedPath.split("/");
	return (
		!segments.some((segment) => excludedDirectories.has(segment)) &&
		!normalizedPath.startsWith("apps/web/e2e/") &&
		!normalizedPath.startsWith("apps/cli/scripts/testing/") &&
		!excludedTestSuffixes.some((suffix) => normalizedPath.endsWith(suffix))
	);
}

function isMissingFile(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}
