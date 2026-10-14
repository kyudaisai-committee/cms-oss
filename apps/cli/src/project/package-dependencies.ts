import { mkdir, readFile, symlink } from "node:fs/promises";
import { findPackageJSON } from "node:module";
import { dirname, join } from "node:path";

interface ProductManifest {
	dependencies: Record<string, string>;
}

export async function linkProductDependencies(
	generatedDirectory: string,
	packageRoot: string,
): Promise<void> {
	const generatedModulesDirectory = join(generatedDirectory, "node_modules");
	const manifest: ProductManifest = JSON.parse(
		await readFile(join(packageRoot, "package.json"), "utf8"),
	);
	await mkdir(generatedModulesDirectory, { recursive: true });

	for (const dependencyName of Object.keys(manifest.dependencies)) {
		const dependencyPath = resolveDependency(dependencyName, packageRoot);
		await createDependencyLink(dependencyPath, join(generatedModulesDirectory, dependencyName));
	}

	await createDependencyLink(
		join(packageRoot, "node_modules", ".bin"),
		join(generatedModulesDirectory, ".bin"),
	);
	await createDependencyLink(packageRoot, join(generatedModulesDirectory, "@repo", "cli"));
}

function resolveDependency(dependencyName: string, packageRoot: string): string {
	const packageJsonPath = findPackageJSON(dependencyName, join(packageRoot, "package.json"));
	if (packageJsonPath === undefined) {
		throw new Error(`CMS product dependency is not installed: ${dependencyName}`);
	}
	return dirname(packageJsonPath);
}

async function createDependencyLink(target: string, linkPath: string): Promise<void> {
	await mkdir(dirname(linkPath), { recursive: true });
	await symlink(target, linkPath, process.platform === "win32" ? "junction" : "dir");
}
