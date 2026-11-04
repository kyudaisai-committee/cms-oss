import { existsSync, readFileSync } from "node:fs";
import { appendFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { prerelease, valid } from "semver";

import { validateCmsReleaseMetadata } from "./migration-release-metadata.ts";
import { collectProductReleaseNotes } from "./product-release-notes.ts";

interface PackageManifest {
	name: string;
	version: string;
}

interface CmsReleaseRegistryModule {
	createCmsReleaseCatalog(packageVersion: string): unknown;
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../");
const packageManifests = [
	{ name: "@repo/cli", relativePath: "apps/cli/package.json" },
	{ name: "@repo/web", relativePath: "apps/web/package.json" },
	{ name: "@repo/api", relativePath: "packages/api/package.json" },
	{ name: "@repo/core", relativePath: "packages/core/package.json" },
	{ name: "@repo/editor", relativePath: "packages/editor/package.json" },
	{ name: "@repo/config", relativePath: "packages/config/package.json" },
];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCmsReleaseRegistryModule(value: unknown): value is CmsReleaseRegistryModule {
	return isRecord(value) && typeof value.createCmsReleaseCatalog === "function";
}

function productArchiveName(version: string): string {
	return `kyudaisai-cms-${version}.tgz`;
}

function readProductVersion(): string {
	const manifests = packageManifests.map(({ name, relativePath }) => {
		const manifestPath = join(repositoryRoot, relativePath);
		const manifest: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
		if (
			!isRecord(manifest) ||
			manifest.name !== name ||
			manifest.private !== true ||
			typeof manifest.version !== "string"
		) {
			throw new Error(`Expected private workspace package ${name} in ${relativePath}.`);
		}
		return { name, version: manifest.version } satisfies PackageManifest;
	});

	const firstManifest = manifests[0];
	if (!firstManifest) throw new Error("CMS product workspace package manifests are missing.");
	const version = firstManifest.version;
	if (valid(version) !== version)
		throw new Error(`CMS package version is not valid SemVer: ${version}`);
	if (manifests.some((manifest) => manifest.version !== version)) {
		throw new Error(
			"CMS product workspace packages must all have the same version before release.",
		);
	}
	return version;
}

function readProductReleaseNotes(version: string): string {
	const changelogs = packageManifests.map(({ name, relativePath }) => {
		const changelogPath = join(dirname(join(repositoryRoot, relativePath)), "CHANGELOG.md");
		if (!existsSync(changelogPath)) {
			throw new Error(`Generated Changesets changelog is missing for ${name}.`);
		}
		return readFileSync(changelogPath, "utf8");
	});
	const releaseNotes = collectProductReleaseNotes(version, changelogs);
	if (!releaseNotes) {
		throw new Error(`Generated Changesets release notes are missing for ${version}.`);
	}
	return releaseNotes;
}

async function prepareProductRelease(): Promise<void> {
	await validateCmsReleaseMetadata();
	const version = readProductVersion();
	const tagName = `v${version}`;
	const assetName = productArchiveName(version);
	const skip = version === "0.0.0";
	const destination = resolve(repositoryRoot, process.argv[2] ?? "dist/release");
	const assetPath = join(destination, assetName);
	let releaseNotesPath = "";

	if (!skip) {
		if (!existsSync(assetPath)) throw new Error(`Product archive does not exist: ${assetPath}`);
		const releaseNotes = readProductReleaseNotes(version);
		const releaseRegistryPath = new URL("../dist/migration/release-registry.js", import.meta.url);
		const releaseRegistryModule: unknown = await import(releaseRegistryPath.href);
		if (!isCmsReleaseRegistryModule(releaseRegistryModule)) {
			throw new Error("The built CMS schema release registry does not expose its catalog factory.");
		}
		releaseRegistryModule.createCmsReleaseCatalog(version);

		releaseNotesPath = join(destination, "release-notes.md");
		await writeFile(releaseNotesPath, `${releaseNotes.trim()}\n`);
	}

	const outputPath = process.env.GITHUB_OUTPUT;
	if (!outputPath)
		throw new Error("GITHUB_OUTPUT is required to prepare product release metadata.");
	const outputs = [
		`skip=${skip}`,
		`version=${version}`,
		`tag_name=${tagName}`,
		`asset_name=${assetName}`,
		`asset_path=${assetPath}`,
		`release_notes_path=${releaseNotesPath}`,
		`prerelease=${prerelease(version) !== null}`,
	].join("\n");
	await appendFile(outputPath, `${outputs}\n`);
	if (skip) console.log("Skipping product release for the unpublished 0.0.0 development version.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	prepareProductRelease().catch((error: unknown) => {
		console.error(error);
		process.exitCode = 1;
	});
}
