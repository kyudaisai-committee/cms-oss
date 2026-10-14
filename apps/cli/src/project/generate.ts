import { randomUUID } from "node:crypto";
import { access, mkdir, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import {
	recoverInterruptedGeneration,
	synchronizeGeneratedProject,
	writeGenerationManifest,
} from "#cli/project/generation-sync";
import { linkProductDependencies } from "#cli/project/package-dependencies";
import type { ProjectPaths } from "#cli/project/paths";

const excludedSourceNames = new Set([
	"coverage",
	"e2e",
	"node_modules",
	"test",
	"tests",
	"pages.gen.ts",
	"waku.server.ts",
]);

export async function generateCmsProject(paths: ProjectPaths): Promise<void> {
	await recoverInterruptedGeneration(paths.cmsDirectory);
	const webSource = await resolveWebSource(paths);
	const webRoot = dirname(webSource);
	const generationId = randomUUID();
	const temporaryDirectory = `${paths.cmsDirectory}.tmp-${generationId}`;

	await mkdir(temporaryDirectory, { recursive: true });
	try {
		await populateGeneratedProject(temporaryDirectory, webSource, webRoot, paths);
		await writeGenerationManifest(temporaryDirectory);
		await synchronizeGeneratedProject(temporaryDirectory, paths.cmsDirectory);
	} finally {
		await rm(temporaryDirectory, { recursive: true, force: true });
	}
}

async function populateGeneratedProject(
	generatedDirectory: string,
	webSource: string,
	webRoot: string,
	paths: ProjectPaths,
): Promise<void> {
	const srcDirectory = join(generatedDirectory, "src");
	await mkdir(srcDirectory, { recursive: true });
	await linkProductDependencies(generatedDirectory, paths.packageRoot);
	await writeFile(
		join(generatedDirectory, "package.json"),
		`${JSON.stringify(
			{
				name: "cms-generated-project",
				private: true,
				type: "module",
			},
			null,
			2,
		)}\n`,
	);
	await writeFile(join(generatedDirectory, "tsconfig.json"), renderTsconfig());
	await createSymlink(
		join(webRoot, "waku.config.ts"),
		join(generatedDirectory, "waku.config.ts"),
		"file",
	);
	await createSymlink(
		join(webSource, "waku.server.ts"),
		join(srcDirectory, "waku.server.ts"),
		"file",
	);
	await linkRuntimeSourceEntries(webSource, srcDirectory);
	await createSymlink(join(webRoot, "public"), join(generatedDirectory, "public"), "dir");
}

async function linkRuntimeSourceEntries(webSource: string, destination: string): Promise<void> {
	for (const entry of await readdir(webSource, { withFileTypes: true })) {
		if (excludedSourceNames.has(entry.name) || isTestFile(entry.name)) continue;
		const kind = entry.isDirectory() ? "dir" : "file";
		await createSymlink(join(webSource, entry.name), join(destination, entry.name), kind);
	}
}

function isTestFile(name: string): boolean {
	return /\.test\.(?:[cm]?[jt]sx?)$/.test(name);
}

function renderTsconfig(): string {
	return `${JSON.stringify(
		{
			compilerOptions: {
				target: "ESNext",
				module: "ESNext",
				moduleResolution: "Bundler",
				jsx: "react-jsx",
				strict: true,
				skipLibCheck: true,
				noEmit: true,
				types: ["node", "vite/client"],
			},
			include: ["src/**/*.ts", "src/**/*.tsx", "waku.config.ts"],
		},
		null,
		2,
	)}\n`;
}

async function resolveWebSource(paths: ProjectPaths): Promise<string> {
	if (await isDirectory(paths.webSourceDirectory)) return paths.webSourceDirectory;
	const developmentSource = resolve(paths.packageRoot, "../web/src");
	if (await isDirectory(developmentSource)) return developmentSource;
	throw new Error("The CMS distribution does not contain the web runtime sources.");
}

async function isDirectory(path: string): Promise<boolean> {
	try {
		return (await stat(path)).isDirectory();
	} catch (error) {
		if (hasErrorCode(error, "ENOENT") || hasErrorCode(error, "ENOTDIR")) return false;
		throw error;
	}
}

async function createSymlink(
	target: string,
	linkPath: string,
	kind: "file" | "dir",
): Promise<void> {
	try {
		await access(target);
	} catch (error) {
		if (hasErrorCode(error, "ENOENT") || hasErrorCode(error, "ENOTDIR")) {
			throw new Error(`Required CMS runtime file is missing: ${target}`, { cause: error });
		}
		throw error;
	}
	await symlink(
		target,
		linkPath,
		process.platform === "win32" && kind === "dir" ? "junction" : kind,
	);
}

function hasErrorCode(error: unknown, code: string): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
