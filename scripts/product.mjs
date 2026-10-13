import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { compilePackageSource } from "./product/compile-package.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const productDirectory = join(repositoryRoot, "dist", "product");
const privatePackages = ["api", "core", "editor", "config"];
const packageDirectories = Object.fromEntries(
	privatePackages.map((name) => [name, join(repositoryRoot, "packages", name)]),
);
const webRuntimeDependencies = new Set([
	"@cloudflare/vite-plugin",
	"@rolldown/plugin-babel",
	"@tailwindcss/vite",
	"@vitejs/plugin-react",
	"babel-plugin-react-compiler",
	"drizzle-kit",
	"vite",
	"wrangler",
]);
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
	const build = spawnSync("pnpm", ["--filter", "@repo/cli", "run", "build"], {
		cwd: repositoryRoot,
		stdio: "inherit",
		shell: false,
	});
	if (build.error) throw build.error;
	if (build.status !== 0)
		throw new Error(`CLI build failed with status ${build.status ?? "unknown"}.`);

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
	await writeProductManifest();
	console.log(`Built self-contained CMS distribution at ${productDirectory}`);
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
		const dependencies = rewriteWorkspaceDependencies(manifest.dependencies ?? {});
		const packageSource = join(sourceDirectory, "src");
		await compilePackageSource(
			manifest.name,
			repositoryRoot,
			packageSource,
			join(destinationDirectory, "dist"),
		);
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

async function collectFiles(directory) {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		if (excludedNames.has(entry.name)) continue;
		const entryPath = join(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await collectFiles(entryPath)));
		} else if (
			entry.isFile() &&
			!entry.name.endsWith(".test.ts") &&
			!entry.name.endsWith(".test.tsx")
		) {
			files.push(entryPath);
		}
	}
	return files;
}

async function createPackageImports(imports, sourceDirectory) {
	const packageName = Object.keys(imports ?? {}).find((name) => name.endsWith("/*"));
	if (!packageName) return imports;
	const prefix = packageName.slice(0, -1);
	const aliases = {};
	for (const entry of await collectFiles(sourceDirectory)) {
		const relativePath = relative(sourceDirectory, entry).replaceAll("\\", "/");
		const extension = relativePath.slice(relativePath.lastIndexOf("."));
		if (extension === ".ts" || extension === ".tsx") {
			if (
				relativePath.endsWith(".d.ts") ||
				relativePath.endsWith(".test.ts") ||
				relativePath.endsWith(".test.tsx")
			)
				continue;
			const sourcePath = `./src/${relativePath}`;
			const outputPath = `./dist/${relativePath.replace(/\.tsx?$/, ".js")}`;
			const moduleName = relativePath.replace(/\.tsx?$/, "");
			aliases[`${prefix}${moduleName}`] = { types: sourcePath, default: outputPath };
			if (moduleName.endsWith("/index")) {
				aliases[`${prefix}${moduleName.slice(0, -"/index".length)}`] = {
					types: sourcePath,
					default: outputPath,
				};
			}
		} else {
			aliases[`${prefix}${relativePath}`] = {
				types: `./src/${relativePath}`,
				default: `./dist/${relativePath}`,
			};
		}
	}
	return aliases;
}

function createPackageExports(exports) {
	return Object.fromEntries(
		Object.entries(exports ?? {}).map(([name, sourcePath]) => [
			name,
			{
				types: sourcePath,
				default: sourcePath.replace(/^\.\/src\//, "./dist/").replace(/\.tsx?$/, ".js"),
			},
		]),
	);
}

async function writeProductManifest() {
	const cliManifest = JSON.parse(
		await readFile(join(repositoryRoot, "apps/cli/package.json"), "utf8"),
	);
	const webManifest = JSON.parse(
		await readFile(join(repositoryRoot, "apps/web/package.json"), "utf8"),
	);
	const dependencies = {
		...cliManifest.dependencies,
		...filterDependencies(webManifest.dependencies, (name) => !name.startsWith("@repo/")),
		...filterDependencies(webManifest.devDependencies, (name) => webRuntimeDependencies.has(name)),
	};
	for (const name of privatePackages) {
		const manifest = JSON.parse(
			await readFile(join(packageDirectories[name], "package.json"), "utf8"),
		);
		dependencies[manifest.name] = manifest.version;
		for (const [dependency, version] of Object.entries(manifest.dependencies ?? {})) {
			if (!dependency.startsWith("@repo/")) dependencies[dependency] = version;
		}
	}
	for (const [name, version] of Object.entries(dependencies)) {
		if (version.startsWith("workspace:")) {
			const privatePackageName = name.slice("@repo/".length);
			const manifest = JSON.parse(
				await readFile(join(packageDirectories[privatePackageName], "package.json"), "utf8"),
			);
			dependencies[name] = manifest.version;
		}
	}

	const productManifest = {
		name: cliManifest.name,
		version: cliManifest.version,
		private: true,
		type: "module",
		bin: cliManifest.bin,
		files: ["bin", "dist", "oclif.config.mjs"],
		imports: {
			"#cli/*": "./dist/*.js",
			"#web/*": "./dist/web/src/*",
		},
		exports: {
			"./package.json": "./package.json",
			"./config": { types: "./dist/config.d.ts", default: "./dist/config.js" },
			"./db/schema": { types: "./dist/db/schema.d.ts", default: "./dist/db/schema.js" },
			"./web/*": "./dist/web/*",
		},
		engines: { node: ">=22" },
		dependencies,
		bundleDependencies: privatePackages.map((name) => `@repo/${name}`),
	};
	await writeFile(
		join(productDirectory, "package.json"),
		`${JSON.stringify(productManifest, null, 2)}\n`,
	);
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

function filterDependencies(dependencies, predicate) {
	return Object.fromEntries(Object.entries(dependencies ?? {}).filter(([name]) => predicate(name)));
}

function rewriteWorkspaceDependencies(dependencies) {
	return Object.fromEntries(
		Object.entries(dependencies).map(([name, version]) => {
			if (!version.startsWith("workspace:")) return [name, version];
			const privatePackageName = name.slice("@repo/".length);
			const packageManifest = JSON.parse(
				readFileSync(join(packageDirectories[privatePackageName], "package.json"), "utf8"),
			);
			return [name, packageManifest.version];
		}),
	);
}
