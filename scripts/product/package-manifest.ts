import { readFileSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const excludedNames = new Set(["node_modules", "e2e", "coverage", "test", "tests"]);

export const privatePackages = ["api", "core", "editor", "config"] as const;

export type PrivatePackageName = (typeof privatePackages)[number];
export type PackageDirectories = Record<PrivatePackageName, string>;

export interface PackageManifest {
	name: string;
	version: string;
	bin: Record<string, string> | undefined;
	dependencies: Record<string, string> | undefined;
	devDependencies: Record<string, string> | undefined;
	peerDependencies: Record<string, string> | undefined;
	imports: Record<string, unknown> | undefined;
	exports: Record<string, unknown> | undefined;
}

interface WriteProductManifestOptions {
	repositoryRoot: string;
	productDirectory: string;
	privatePackages: readonly PrivatePackageName[];
	packageDirectories: PackageDirectories;
}

interface ProductManifest {
	name: string;
	version: string;
	private: true;
	type: "module";
	bin?: Record<string, string>;
	files: string[];
	imports: Record<string, string>;
	exports: Record<string, string | { types: string; default: string }>;
	engines: { node: string };
	dependencies: Record<string, string>;
	bundleDependencies: string[];
}

export async function createPackageImports(
	imports: Record<string, unknown> | undefined,
	sourceDirectory: string,
): Promise<Record<string, unknown> | undefined> {
	const packageName = Object.keys(imports ?? {}).find((name) => name.endsWith("/*"));
	if (!packageName) return imports;
	const prefix = packageName.slice(0, -1);
	const aliases: Record<string, { types: string; default: string }> = {};
	for (const entry of await collectFiles(sourceDirectory)) {
		const relativePath = relative(sourceDirectory, entry).replaceAll("\\", "/");
		const extension = extname(relativePath);
		if (extension === ".ts" || extension === ".tsx") {
			if (
				relativePath.endsWith(".d.ts") ||
				relativePath.endsWith(".test.ts") ||
				relativePath.endsWith(".test.tsx")
			) {
				continue;
			}
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

export function createPackageExports(
	exports: Record<string, unknown> | undefined,
): Record<string, { types: string; default: string }> {
	const entries: [string, { types: string; default: string }][] = [];
	for (const [name, sourcePath] of Object.entries(exports ?? {})) {
		if (typeof sourcePath !== "string") {
			throw new Error(`Private product package export ${name} must be a string.`);
		}
		entries.push([
			name,
			{
				types: sourcePath,
				default: sourcePath.replace(/^\.\/src\//, "./dist/").replace(/\.tsx?$/, ".js"),
			},
		]);
	}
	return Object.fromEntries(entries);
}

export async function writeProductManifest({
	repositoryRoot,
	productDirectory,
	privatePackages: privatePackageNames,
	packageDirectories,
}: WriteProductManifestOptions): Promise<void> {
	const cliManifest = await readPackageManifest(join(repositoryRoot, "apps/cli/package.json"));
	const webManifest = await readPackageManifest(join(repositoryRoot, "apps/web/package.json"));
	const dependencies: Record<string, string> = {};
	const dependencySources = new Map<string, string>();
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
	addDependencies(
		dependencies,
		dependencySources,
		requiredProductTypeDependencies(webManifest.devDependencies, "apps/web"),
		"apps/web",
	);
	for (const name of privatePackageNames) {
		const manifest = await readPackageManifest(join(packageDirectories[name], "package.json"));
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

	const productManifest: ProductManifest = {
		name: cliManifest.name,
		version: cliManifest.version,
		private: true,
		type: "module",
		...(cliManifest.bin ? { bin: cliManifest.bin } : {}),
		files: ["bin", "changelogs", "dist", "oclif.config.mjs"],
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
		engines: { node: "^22.15.0 || ^24.0.0 || ^26.0.0" },
		dependencies,
		bundleDependencies: privatePackageNames.map((name) => `@repo/${name}`),
	};
	await writeFile(
		join(productDirectory, "package.json"),
		`${JSON.stringify(productManifest, null, 2)}\n`,
	);
}

async function collectFiles(directory: string): Promise<string[]> {
	const files: string[] = [];
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

export async function readPackageManifest(path: string): Promise<PackageManifest> {
	const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
	if (!isRecord(parsed) || typeof parsed.name !== "string" || typeof parsed.version !== "string") {
		throw new Error(`Invalid package manifest: ${path}`);
	}
	return {
		name: parsed.name,
		version: parsed.version,
		bin: optionalStringRecord(parsed.bin, "bin", path),
		dependencies: optionalStringRecord(parsed.dependencies, "dependencies", path),
		devDependencies: optionalStringRecord(parsed.devDependencies, "devDependencies", path),
		peerDependencies: optionalStringRecord(parsed.peerDependencies, "peerDependencies", path),
		imports: optionalUnknownRecord(parsed.imports, "imports", path),
		exports: optionalUnknownRecord(parsed.exports, "exports", path),
	};
}

function requiredProductTypeDependencies(
	devDependencies: Record<string, string> | undefined,
	source: string,
): Record<string, string> {
	const requiredNames = ["@types/node", "@types/react", "@types/react-dom"];
	return Object.fromEntries(
		requiredNames.map((name) => {
			const version = devDependencies?.[name];
			if (version === undefined) {
				throw new Error(`${source} must declare ${name} for consumer TypeScript checks.`);
			}
			return [name, version];
		}),
	);
}

function optionalStringRecord(
	value: unknown,
	fieldName: string,
	path: string,
): Record<string, string> | undefined {
	if (value === undefined) return undefined;
	if (!isRecord(value)) throw new Error(`Invalid ${fieldName} in package manifest: ${path}`);
	const result: Record<string, string> = {};
	for (const [key, entry] of Object.entries(value)) {
		if (typeof entry !== "string") {
			throw new Error(`Invalid ${fieldName} in package manifest: ${path}`);
		}
		result[key] = entry;
	}
	return result;
}

function optionalUnknownRecord(
	value: unknown,
	fieldName: string,
	path: string,
): Record<string, unknown> | undefined {
	if (value === undefined) return undefined;
	if (!isRecord(value)) throw new Error(`Invalid ${fieldName} in package manifest: ${path}`);
	return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function filterDependencies(
	dependencies: Record<string, string> | undefined,
	predicate: (name: string) => boolean,
): Record<string, string> {
	return Object.fromEntries(Object.entries(dependencies ?? {}).filter(([name]) => predicate(name)));
}

function addDependencies(
	dependencies: Record<string, string>,
	sources: Map<string, string>,
	additions: Record<string, string>,
	source: string,
): void {
	for (const [name, version] of Object.entries(additions)) {
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

export function rewriteWorkspaceDependencies(
	dependencies: Record<string, string>,
	packageDirectories: PackageDirectories,
): Record<string, string> {
	return Object.fromEntries(
		Object.entries(dependencies).map(([name, version]) => {
			if (!version.startsWith("workspace:")) return [name, version];
			if (!name.startsWith("@repo/")) {
				throw new Error(`Workspace dependency ${name} is outside the private product packages.`);
			}
			const packageName = name.slice("@repo/".length);
			if (!isPrivatePackageName(packageName)) {
				throw new Error(`Unknown private product dependency: ${name}`);
			}
			const manifestPath = join(packageDirectories[packageName], "package.json");
			const parsed: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
			if (!isRecord(parsed) || typeof parsed.version !== "string") {
				throw new Error(`Invalid package version in ${manifestPath}`);
			}
			return [name, parsed.version];
		}),
	);
}

function isPrivatePackageName(name: string): name is PrivatePackageName {
	return privatePackages.some((packageName) => packageName === name);
}
