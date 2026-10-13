import { spawnSync } from "node:child_process";
import { cp, readdir, readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const gitPackageDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(gitPackageDirectory, "../..");
const productDirectory = join(repositoryRoot, "dist/product");

runPnpm(
	[
		"install",
		"--filter",
		"@repo/cli...",
		"--filter",
		"@repo/api",
		"--filter",
		"@repo/editor",
		"--ignore-scripts",
		"--frozen-lockfile",
	],
	repositoryRoot,
);
runPnpm(["run", "build:product"], repositoryRoot);
await installBuiltProduct();

async function installBuiltProduct() {
	const productManifest = JSON.parse(
		await readFile(join(productDirectory, "package.json"), "utf8"),
	);
	const bootstrapManifest = JSON.parse(
		await readFile(join(gitPackageDirectory, "package.json"), "utf8"),
	);
	if (productManifest.name !== bootstrapManifest.name) {
		throw new Error(
			`The built product name ${productManifest.name} does not match ${bootstrapManifest.name}.`,
		);
	}
	if (productManifest.version !== bootstrapManifest.version) {
		throw new Error(
			`The built product version ${productManifest.version} does not match ${bootstrapManifest.version}.`,
		);
	}
	const runtimeDependencies = Object.fromEntries(
		Object.entries(productManifest.dependencies).filter(([name]) => !name.startsWith("@repo/")),
	);
	if (!haveSameEntries(runtimeDependencies, bootstrapManifest.dependencies)) {
		throw new Error(
			"Git package dependencies must match the built product's runtime dependencies.",
		);
	}
	if (!haveSameValues(productManifest.bundleDependencies, bootstrapManifest.bundleDependencies)) {
		throw new Error("Git package bundleDependencies must match the built product.");
	}
	const sourceDependencies = Object.fromEntries(
		productManifest.bundleDependencies.map((name) => [
			name,
			`file:../../packages/${name.slice("@repo/".length)}`,
		]),
	);
	if (!haveSameEntries(sourceDependencies, bootstrapManifest.devDependencies ?? {})) {
		throw new Error("Git package source dependencies must point to the bundled workspaces.");
	}
	await rm(join(gitPackageDirectory, "node_modules/@repo"), { recursive: true, force: true });
	for (const entry of await readdir(productDirectory, { withFileTypes: true })) {
		await cp(join(productDirectory, entry.name), join(gitPackageDirectory, entry.name), {
			recursive: true,
			force: true,
		});
	}
	for (const name of productManifest.bundleDependencies) {
		const bundledManifest = JSON.parse(
			await readFile(join(gitPackageDirectory, "node_modules", name, "package.json"), "utf8"),
		);
		if (bundledManifest.name !== name) {
			throw new Error(`The bundled package ${name} is missing from the Git package.`);
		}
	}
	await rm(join(gitPackageDirectory, "prepare.mjs"), { force: true });
}

function haveSameEntries(left, right) {
	const leftKeys = Object.keys(left).sort();
	const rightKeys = Object.keys(right).sort();
	return (
		leftKeys.length === rightKeys.length &&
		leftKeys.every((key, index) => key === rightKeys[index] && left[key] === right[key])
	);
}

function haveSameValues(left, right) {
	const leftValues = [...left].sort();
	const rightValues = [...right].sort();
	return (
		leftValues.length === rightValues.length &&
		leftValues.every((value, index) => value === rightValues[index])
	);
}

function runPnpm(args, cwd) {
	const result = spawnSync("pnpm", args, { cwd, stdio: "inherit", shell: false });
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(`pnpm ${args.join(" ")} failed with status ${result.status ?? "unknown"}.`);
	}
}
