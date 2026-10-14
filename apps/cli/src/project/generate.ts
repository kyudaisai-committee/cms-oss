import { randomUUID } from "node:crypto";
import { access, mkdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

import {
	recoverInterruptedGeneration,
	synchronizeGeneratedProject,
	writeGenerationManifest,
} from "#cli/project/generation-sync";
import { linkProductDependencies } from "#cli/project/package-dependencies";
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
				'import { createRequire } from "node:module";',
				"",
				"const require = createRequire(import.meta.url);",
				"",
				"export default {",
				'\tdialect: "sqlite",',
				'\tschema: require.resolve("@repo/cli/db/schema"),',
				'\tout: "./drizzle",',
				"};",
				"",
			].join("\n"),
		);
	}
}

export async function generateCmsProject(paths: ProjectPaths): Promise<void> {
	await recoverInterruptedGeneration(paths.cmsDirectory);
	const webSource = await resolveWebSource(paths);
	const generationId = randomUUID();
	const temporaryDirectory = `${paths.cmsDirectory}.tmp-${generationId}`;

	await mkdir(temporaryDirectory, { recursive: true });
	try {
		await populateGeneratedProject(temporaryDirectory, webSource, paths);
		await writeGenerationManifest(temporaryDirectory);
		await synchronizeGeneratedProject(temporaryDirectory, paths.cmsDirectory);
	} finally {
		await rm(temporaryDirectory, { recursive: true, force: true });
	}
}

async function populateGeneratedProject(
	generatedDirectory: string,
	webSource: string,
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
		"export default createCmsWakuConfig(environment.cloudflare, config.devServer.allowedHosts);",
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
