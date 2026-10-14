import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { copyPackageAssets } from "./product/copy-package-assets.mjs";
import {
	createPackageExports,
	createPackageImports,
	rewriteWorkspaceDependencies,
	writeProductManifest,
} from "./product/package-manifest.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const productDirectory = join(repositoryRoot, "dist", "product");
const privatePackages = ["api", "core", "editor", "config"];
const packageDirectories = Object.fromEntries(
	privatePackages.map((name) => [name, join(repositoryRoot, "packages", name)]),
);
const excludedNames = new Set(["node_modules", "e2e", "coverage", "test", "tests"]);

const action = process.argv[2] ?? "build";
if (action !== "build" && action !== "pack") {
	throw new Error(`Unknown product action: ${action}`);
}

await buildProduct();
if (action === "pack") {
	await packProduct();
}

async function buildProduct() {
	await cleanBuildDirectories();
	const build = spawnSync(
		"pnpm",
		[
			"--recursive",
			"--filter",
			"@repo/cli",
			...privatePackages.flatMap((name) => ["--filter", `@repo/${name}`]),
			"run",
			"build",
		],
		{
			cwd: repositoryRoot,
			stdio: "inherit",
			shell: false,
		},
	);
	if (build.error) throw build.error;
	if (build.status !== 0)
		throw new Error(`Workspace build failed with status ${build.status ?? "unknown"}.`);

	await rm(productDirectory, { recursive: true, force: true });
	await mkdir(productDirectory, { recursive: true });
	await cp(join(repositoryRoot, "apps/cli/bin/run.js"), join(productDirectory, "bin/run.js"));
	await cp(
		join(repositoryRoot, "apps/cli/oclif.config.mjs"),
		join(productDirectory, "oclif.config.mjs"),
	);
	await copyFilteredDirectory(
		join(repositoryRoot, "apps/cli/dist"),
		join(productDirectory, "dist"),
	);
	await copyWebRuntime();
	await copyPrivatePackages();
	await writeProductManifest({
		repositoryRoot,
		productDirectory,
		privatePackages,
		packageDirectories,
	});
	console.log(`Built self-contained CMS distribution at ${productDirectory}`);
}

async function cleanBuildDirectories() {
	const directories = [
		join(repositoryRoot, "apps/cli/dist"),
		...Object.values(packageDirectories).map((directory) => join(directory, "dist")),
		productDirectory,
	];
	await Promise.all(
		directories.map((directory) => rm(directory, { recursive: true, force: true })),
	);
}

async function copyWebRuntime() {
	const webDestination = join(productDirectory, "dist/web");
	await mkdir(webDestination, { recursive: true });
	await copyFilteredDirectory(join(repositoryRoot, "apps/web/src"), join(webDestination, "src"));
	await cp(join(repositoryRoot, "apps/web/waku.config.ts"), join(webDestination, "waku.config.ts"));
	await copyFilteredDirectory(
		join(repositoryRoot, "apps/web/public"),
		join(webDestination, "public"),
	);
}

async function copyPrivatePackages() {
	const dependencyRoot = join(productDirectory, "node_modules/@repo");
	await mkdir(dependencyRoot, { recursive: true });
	for (const name of privatePackages) {
		const sourceDirectory = packageDirectories[name];
		const destinationDirectory = join(dependencyRoot, name);
		await mkdir(destinationDirectory, { recursive: true });
		const manifest = JSON.parse(await readFile(join(sourceDirectory, "package.json"), "utf8"));
		const dependencies = rewriteWorkspaceDependencies(
			manifest.dependencies ?? {},
			packageDirectories,
		);
		const packageSource = join(sourceDirectory, "src");
		const packageBuildDirectory = join(sourceDirectory, "dist");
		await copyPackageAssets(packageSource, packageBuildDirectory);
		await copyFilteredDirectory(packageBuildDirectory, join(destinationDirectory, "dist"));
		const imports = await createPackageImports(manifest.imports, packageSource);
		await writeFile(
			join(destinationDirectory, "package.json"),
			`${JSON.stringify(
				{
					name: manifest.name,
					version: manifest.version,
					private: true,
					type: "module",
					imports,
					exports: createPackageExports(manifest.exports),
					dependencies,
					peerDependencies: manifest.peerDependencies,
				},
				null,
				2,
			)}\n`,
		);
		await copyFilteredDirectory(packageSource, join(destinationDirectory, "src"));
	}
}

async function packProduct() {
	const destinationArgument = process.argv.indexOf("--pack-destination");
	const destination =
		destinationArgument >= 0
			? resolve(process.argv[destinationArgument + 1])
			: join(repositoryRoot, "dist", "artifacts");
	await mkdir(destination, { recursive: true });
	const pack = spawnSync("pnpm", ["pack", "--pack-destination", destination], {
		cwd: productDirectory,
		stdio: "inherit",
		shell: false,
	});
	if (pack.error) throw pack.error;
	if (pack.status !== 0)
		throw new Error(`pnpm pack failed with status ${pack.status ?? "unknown"}.`);
}

async function copyFilteredDirectory(source, destination) {
	await mkdir(destination, { recursive: true });
	for (const entry of await readdir(source, { withFileTypes: true })) {
		if (
			excludedNames.has(entry.name) ||
			entry.name.endsWith(".test.ts") ||
			entry.name.endsWith(".test.tsx") ||
			entry.name.endsWith(".test.d.ts") ||
			entry.name.endsWith(".test.js") ||
			entry.name.endsWith(".test.jsx")
		) {
			continue;
		}
		const sourcePath = join(source, entry.name);
		const destinationPath = join(destination, entry.name);
		if (entry.isDirectory()) {
			await copyFilteredDirectory(sourcePath, destinationPath);
		} else if (entry.isFile()) {
			await cp(sourcePath, destinationPath);
		}
	}
}
