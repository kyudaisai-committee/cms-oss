import { randomUUID } from "node:crypto";
import {
	access,
	lstat,
	mkdir,
	open,
	readdir,
	readFile,
	readlink,
	rename,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

import type { ProjectPaths } from "#cli/project/paths";

const sourceEntries = ["components", "features", "lib", "middleware", "pages"] as const;
const sourceFiles = ["cms-settings.ts", "styles.css", "vite-env.d.ts"] as const;

export async function ensureStarterFiles(paths: ProjectPaths): Promise<void> {
	try {
		await access(paths.configPath);
	} catch {
		await writeFileAtomically(
			paths.configPath,
			'/** CMS configuration. Keep Cloudflare secrets outside this file. */\nimport { defineConfig } from "@repo/cli/config";\n\nexport default defineConfig({});\n',
		);
	}

	try {
		await access(paths.drizzleConfigPath);
	} catch {
		await writeFileAtomically(
			paths.drizzleConfigPath,
			[
				"export default {",
				'\tdialect: "sqlite",',
				'\tschema: "./node_modules/@repo/cli/dist/db/schema.js",',
				'\tout: "./drizzle",',
				"};",
				"",
			].join("\n"),
		);
	}
}

export async function generateCmsProject(paths: ProjectPaths): Promise<void> {
	const webSource = await resolveWebSource(paths);
	const generationId = randomUUID();
	const temporaryDirectory = `${paths.cmsDirectory}.tmp-${generationId}`;
	const backupDirectory = `${paths.cmsDirectory}.old-${generationId}`;
	let movedExistingProject = false;

	await mkdir(temporaryDirectory, { recursive: true });
	try {
		await populateGeneratedProject(temporaryDirectory, webSource, paths);
		if (await haveSameContents(temporaryDirectory, paths.cmsDirectory)) {
			await rm(temporaryDirectory, { recursive: true, force: true });
			return;
		}
		try {
			await rename(paths.cmsDirectory, backupDirectory);
			movedExistingProject = true;
		} catch (error) {
			if (!isMissingPath(error)) throw error;
		}
		await rename(temporaryDirectory, paths.cmsDirectory);
		if (movedExistingProject) {
			await rm(backupDirectory, { recursive: true, force: true });
		}
	} catch (error) {
		await rm(temporaryDirectory, { recursive: true, force: true });
		if (movedExistingProject) {
			await rename(backupDirectory, paths.cmsDirectory);
		}
		throw error;
	}
}

async function haveSameContents(leftDirectory: string, rightDirectory: string): Promise<boolean> {
	const entries = await Promise.all([
		readdir(leftDirectory, { withFileTypes: true }),
		readdir(rightDirectory, { withFileTypes: true }),
	]).catch((error: unknown) => {
		if (isMissingPath(error)) return undefined;
		throw error;
	});
	if (!entries) return false;
	const [leftEntries, rightEntries] = entries;

	if (leftEntries.length !== rightEntries.length) return false;
	const rightNames = new Set(rightEntries.map((entry) => entry.name));
	for (const entry of leftEntries) {
		if (!rightNames.has(entry.name)) return false;
		const leftPath = join(leftDirectory, entry.name);
		const rightPath = join(rightDirectory, entry.name);
		const [leftStat, rightStat] = await Promise.all([lstat(leftPath), lstat(rightPath)]);
		if (leftStat.isSymbolicLink() !== rightStat.isSymbolicLink()) return false;
		if (leftStat.isSymbolicLink()) {
			if ((await readlink(leftPath)) !== (await readlink(rightPath))) return false;
		} else if (leftStat.isDirectory() && rightStat.isDirectory()) {
			if (!(await haveSameContents(leftPath, rightPath))) return false;
		} else if (leftStat.isFile() && rightStat.isFile()) {
			const [leftContents, rightContents] = await Promise.all([
				readFile(leftPath),
				readFile(rightPath),
			]);
			if (!leftContents.equals(rightContents)) return false;
		} else {
			return false;
		}
	}
	return true;
}

export async function withProjectLock<T>(
	projectRoot: string,
	operation: () => Promise<T>,
): Promise<T> {
	const lockPath = join(projectRoot, ".cms.lock");
	let lockHandle;
	try {
		lockHandle = await open(lockPath, "wx");
	} catch (error) {
		if (isAlreadyExists(error)) {
			throw new Error(
				`Another CMS command is using ${join(projectRoot, ".cms")}. Wait for it to finish before starting another command.`,
			);
		}
		throw error;
	}

	try {
		await lockHandle.writeFile(`${process.pid}\n`);
		return await operation();
	} finally {
		await lockHandle.close();
		await rm(lockPath, { force: true });
	}
}

async function populateGeneratedProject(
	generatedDirectory: string,
	webSource: string,
	paths: ProjectPaths,
): Promise<void> {
	const srcDirectory = join(generatedDirectory, "src");
	await mkdir(srcDirectory, { recursive: true });
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
	await writeFile(join(generatedDirectory, "waku.config.ts"), renderWakuConfig(paths));
	await writeFile(join(generatedDirectory, "tsconfig.json"), renderTsconfig());
	await writeFile(join(srcDirectory, "waku.server.ts"), renderServerEntry());

	for (const entry of sourceEntries) {
		await createSymlink(join(webSource, entry), join(srcDirectory, entry), "dir");
	}
	for (const file of sourceFiles) {
		await createSymlink(join(webSource, file), join(srcDirectory, file), "file");
	}
	await createSymlink(join(webSource, "../public"), join(generatedDirectory, "public"), "dir");
}

function renderWakuConfig(paths: ProjectPaths): string {
	const relativeConfigPath = relative(paths.cmsDirectory, paths.configPath).replaceAll("\\", "/");
	const configSpecifier = relativeConfigPath.startsWith(".")
		? relativeConfigPath
		: `./${relativeConfigPath}`;
	return [
		`import consumerConfig from ${JSON.stringify(configSpecifier)};`,
		'import { resolveEnvironment, validateConfig } from "@repo/cli/config";',
		'import { createCmsWakuConfig } from "@repo/cli/web/waku.config.ts";',
		"",
		"const config = validateConfig(consumerConfig);",
		"const environment = resolveEnvironment(config, process.env.CMS_ENVIRONMENT_NAME);",
		"",
		"export default createCmsWakuConfig(environment.cloudflare);",
		"",
	].join("\n");
}

function renderServerEntry(): string {
	return [
		'import { fsRouter } from "waku";',
		'import adapter from "waku/adapters/cloudflare";',
		"",
		'const handlers = fsRouter(import.meta.glob("./pages/**/*.{tsx,ts}"));',
		"",
		"export default adapter(handlers, {",
		'\tmiddlewareModules: import.meta.glob(["./middleware/*.ts", "!./middleware/*.test.ts"]),',
		"});",
		"",
	].join("\n");
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
	try {
		await access(paths.webSourceDirectory);
		return paths.webSourceDirectory;
	} catch {
		const developmentSource = resolve(paths.packageRoot, "../web/src");
		try {
			await access(developmentSource);
			return developmentSource;
		} catch {
			throw new Error("The CMS distribution does not contain the web runtime sources.");
		}
	}
}

async function createSymlink(
	target: string,
	linkPath: string,
	kind: "file" | "dir",
): Promise<void> {
	try {
		await access(target);
	} catch {
		throw new Error(`Required CMS runtime file is missing: ${target}`);
	}
	await symlink(
		target,
		linkPath,
		process.platform === "win32" && kind === "dir" ? "junction" : kind,
	);
}

async function writeFileAtomically(path: string, content: string): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const temporaryPath = `${path}.tmp-${randomUUID()}`;
	await writeFile(temporaryPath, content, { flag: "wx" });
	await rename(temporaryPath, path);
}

function isMissingPath(error: unknown): boolean {
	return hasErrorCode(error, "ENOENT");
}

function isAlreadyExists(error: unknown): boolean {
	return hasErrorCode(error, "EEXIST");
}

function hasErrorCode(error: unknown, code: string): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
