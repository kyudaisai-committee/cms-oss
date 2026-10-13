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
	for (const entry of await readdir(productDirectory, { withFileTypes: true })) {
		await cp(join(productDirectory, entry.name), join(gitPackageDirectory, entry.name), {
			recursive: true,
			force: true,
		});
	}
	await rm(join(gitPackageDirectory, "prepare.mjs"), { force: true });
}

function runPnpm(args, cwd) {
	const result = spawnSync("pnpm", args, { cwd, stdio: "inherit", shell: false });
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(`pnpm ${args.join(" ")} failed with status ${result.status ?? "unknown"}.`);
	}
}
