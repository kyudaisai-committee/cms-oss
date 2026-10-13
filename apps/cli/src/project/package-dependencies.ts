import { access, mkdir, readFile, symlink } from "node:fs/promises";
import { createRequire } from "node:module";
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
	const requireFromProduct = createRequire(join(packageRoot, "package.json"));
	await mkdir(generatedModulesDirectory, { recursive: true });

	for (const dependencyName of Object.keys(manifest.dependencies)) {
		const dependencyPath = await resolveDependency(dependencyName, requireFromProduct);
		await createDependencyLink(dependencyPath, join(generatedModulesDirectory, dependencyName));
	}

	await createDependencyLink(
		join(packageRoot, "node_modules", ".bin"),
		join(generatedModulesDirectory, ".bin"),
	);
	await createDependencyLink(packageRoot, join(generatedModulesDirectory, "@repo", "cli"));
}

async function resolveDependency(
	dependencyName: string,
	requireFromProduct: NodeJS.Require,
): Promise<string> {
	const searchPaths = requireFromProduct.resolve.paths(dependencyName);
	if (!searchPaths) {
		throw new Error(`Cannot resolve CMS product dependency: ${dependencyName}`);
	}
	for (const searchPath of searchPaths) {
		const candidate = join(searchPath, dependencyName);
		try {
			await access(candidate);
			return candidate;
		} catch {
			continue;
		}
	}
	throw new Error(`CMS product dependency is not installed: ${dependencyName}`);
}

async function createDependencyLink(target: string, linkPath: string): Promise<void> {
	await mkdir(dirname(linkPath), { recursive: true });
	await symlink(target, linkPath, process.platform === "win32" ? "junction" : "dir");
}
