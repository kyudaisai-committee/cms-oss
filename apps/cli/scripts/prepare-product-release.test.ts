import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { copyFile, mkdir, mkdtempDisposable, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

interface ProductPackage {
	name: string;
	relativePath: string;
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../");
const packages: ProductPackage[] = [
	{ name: "@repo/cli", relativePath: "apps/cli/package.json" },
	{ name: "@repo/web", relativePath: "apps/web/package.json" },
	{ name: "@repo/api", relativePath: "packages/api/package.json" },
	{ name: "@repo/core", relativePath: "packages/core/package.json" },
	{ name: "@repo/editor", relativePath: "packages/editor/package.json" },
	{ name: "@repo/config", relativePath: "packages/config/package.json" },
];

function readProductVersion(): string {
	const manifest: unknown = JSON.parse(
		readFileSync(join(repositoryRoot, "apps/cli/package.json"), "utf8"),
	);
	if (
		typeof manifest !== "object" ||
		manifest === null ||
		!("version" in manifest) ||
		typeof manifest.version !== "string"
	) {
		throw new Error("The CLI package version is missing.");
	}
	return manifest.version;
}

async function copyFixtureFile(fixtureRoot: string, relativePath: string): Promise<void> {
	const destination = join(fixtureRoot, relativePath);
	await mkdir(dirname(destination), { recursive: true });
	await copyFile(join(repositoryRoot, relativePath), destination);
}

describe("prepare product release metadata", () => {
	it("validates the product and writes workflow outputs and generated release notes", async () => {
		await using fixture = await mkdtempDisposable(join(tmpdir(), "cms-release-prepare-"));
		const fixtureCli = join(fixture.path, "apps/cli");
		const fixtureScripts = join(fixtureCli, "scripts");
		await mkdir(fixtureScripts, { recursive: true });
		await symlink(
			resolve(dirname(fileURLToPath(import.meta.url)), "../node_modules"),
			join(fixtureCli, "node_modules"),
			"dir",
		);

		for (const filename of [
			"prepare-product-release.ts",
			"product-release-notes.ts",
			"migration-release-metadata.ts",
			"database-schema-history.ts",
		]) {
			await copyFixtureFile(fixture.path, `apps/cli/scripts/${filename}`);
		}
		for (const filename of [
			"database-changes.ts",
			"release-history.ts",
			"release-metadata.generated.ts",
			"schema-history.json",
		]) {
			await copyFixtureFile(fixture.path, `apps/cli/src/migration/${filename}`);
		}

		for (const { relativePath } of packages) {
			await copyFixtureFile(fixture.path, relativePath);
			await copyFixtureFile(fixture.path, join(dirname(relativePath), "CHANGELOG.md"));
		}

		const version = readProductVersion();
		const destination = join(fixture.path, "dist/release");
		await mkdir(destination, { recursive: true });
		const canonicalDestination = await realpath(destination);
		const assetName = `kyudaisai-cms-${version}.tgz`;
		await writeFile(join(destination, assetName), "archive");
		const registryPath = join(fixtureCli, "dist/migration/release-registry.js");
		await mkdir(dirname(registryPath), { recursive: true });
		await writeFile(registryPath, "export function createCmsReleaseCatalog() { return {}; }\n");
		const outputPath = join(fixture.path, "github-output.txt");
		await writeFile(outputPath, "");

		const entryPoint = join(fixtureScripts, "prepare-product-release.ts");
		const result = spawnSync(process.execPath, [await realpath(entryPoint), "dist/release"], {
			cwd: fixture.path,
			encoding: "utf8",
			env: { ...process.env, GITHUB_OUTPUT: outputPath },
		});
		const outputs = readFileSync(outputPath, "utf8");

		expect(result.status).toBe(0);
		expect(result.stderr).toBe("");
		expect(outputs).toContain("skip=false");
		expect(outputs).toContain(`version=${version}`);
		expect(outputs).toContain(`tag_name=v${version}`);
		expect(outputs).toContain(`asset_name=${assetName}`);
		expect(outputs).toContain(`asset_path=${join(canonicalDestination, assetName)}`);
		expect(outputs).toContain(
			`release_notes_path=${join(canonicalDestination, "release-notes.md")}`,
		);
		expect(readFileSync(join(destination, "release-notes.md"), "utf8").trim()).not.toBe("");
	});
});
