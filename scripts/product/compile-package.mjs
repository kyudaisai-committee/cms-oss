import { spawnSync } from "node:child_process";
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

const testDirectoryNames = new Set(["test", "tests"]);

export async function compilePackageSource(
	packageName,
	repositoryRoot,
	sourceDirectory,
	outputDirectory,
) {
	const compile = spawnSync(
		"pnpm",
		[
			"--filter",
			packageName,
			"exec",
			"tsc",
			"-p",
			"tsconfig.json",
			"--noEmit",
			"false",
			"--declaration",
			"false",
			"--rootDir",
			"src",
			"--outDir",
			outputDirectory,
		],
		{ cwd: repositoryRoot, stdio: "inherit", shell: false },
	);
	if (compile.error) throw compile.error;
	if (compile.status !== 0) {
		throw new Error(
			`Could not compile ${packageName} for the product artifact: ${compile.status ?? "unknown status"}.`,
		);
	}
	await removeTestArtifacts(sourceDirectory, outputDirectory);
	await copyRuntimeAssets(sourceDirectory, outputDirectory);
}

async function removeTestArtifacts(sourceDirectory, outputDirectory) {
	for (const entry of await readdir(sourceDirectory, { withFileTypes: true })) {
		const sourcePath = join(sourceDirectory, entry.name);
		const outputPath = join(outputDirectory, entry.name.replace(/\.tsx?$/, ".js"));
		if (entry.isDirectory()) {
			if (testDirectoryNames.has(entry.name)) {
				await rm(outputPath, { recursive: true, force: true });
			} else {
				await removeTestArtifacts(sourcePath, outputPath);
			}
		} else if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx")) {
			await rm(outputPath, { force: true });
		}
	}
}

async function copyRuntimeAssets(sourceDirectory, outputDirectory) {
	for (const entry of await readdir(sourceDirectory, { withFileTypes: true })) {
		if (
			testDirectoryNames.has(entry.name) ||
			entry.name.endsWith(".test.ts") ||
			entry.name.endsWith(".test.tsx")
		) {
			continue;
		}
		const sourcePath = join(sourceDirectory, entry.name);
		const outputPath = join(outputDirectory, entry.name);
		if (entry.isDirectory()) {
			await copyRuntimeAssets(sourcePath, outputPath);
		} else if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) {
			await mkdir(outputDirectory, { recursive: true });
			await cp(sourcePath, outputPath);
		}
	}
}
