import { readFileSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

const excludedNames = new Set(["node_modules", "e2e", "coverage", "test", "tests"]);

export async function createPackageImports(imports, sourceDirectory) {
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

export function createPackageExports(exports) {
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

export async function writeProductManifest({
	repositoryRoot,
	productDirectory,
	privatePackages,
	packageDirectories,
}) {
	const cliManifest = await readJson(join(repositoryRoot, "apps/cli/package.json"));
	const webManifest = await readJson(join(repositoryRoot, "apps/web/package.json"));
	const dependencies = {};
	const dependencySources = new Map();
	addDependencies(
		dependencies,
		dependencySources,
		filterDependencies(cliManifest.dependencies, (name) => !name.startsWith("@repo/")),
		"apps/cli",
	);
	addDependencies(
		dependencies,
		dependencySources,
		filterDependencies(webManifest.dependencies, (name) => !name.startsWith("@repo/")),
		"apps/web",
	);
	for (const name of privatePackages) {
		const manifest = await readJson(join(packageDirectories[name], "package.json"));
		addDependencies(
			dependencies,
			dependencySources,
			{ [manifest.name]: manifest.version },
			`packages/${name}`,
		);
		addDependencies(
			dependencies,
			dependencySources,
			filterDependencies(manifest.dependencies, (dependency) => !dependency.startsWith("@repo/")),
			`packages/${name}`,
		);
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

async function readJson(path) {
	return JSON.parse(await readFile(path, "utf8"));
}

function filterDependencies(dependencies, predicate) {
	return Object.fromEntries(Object.entries(dependencies ?? {}).filter(([name]) => predicate(name)));
}

function addDependencies(dependencies, sources, additions, source) {
	for (const [name, version] of Object.entries(additions ?? {})) {
		const existingVersion = dependencies[name];
		if (existingVersion !== undefined && existingVersion !== version) {
			throw new Error(
				`Conflicting product dependency ${name}: ${existingVersion} from ${sources.get(name)} and ${version} from ${source}.`,
			);
		}
		dependencies[name] = version;
		sources.set(name, source);
	}
}

export function rewriteWorkspaceDependencies(dependencies, packageDirectories) {
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
