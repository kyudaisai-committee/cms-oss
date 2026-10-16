import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtempDisposable, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { prerelease, valid } from "semver";

import { collectProductReleaseNotes } from "./product-release-notes.ts";

type ProductReleaseAction = "skip" | "create" | "upload" | "publish";

interface ProductReleasePlan {
	action: ProductReleaseAction;
	prerelease: boolean;
	tagName: string;
}

interface GitHubReleaseState {
	assets: string[];
	isDraft: boolean;
	isPrerelease: boolean;
	targetCommitish: string | undefined;
}

interface GitHubCliResult {
	status: number;
	stderr: string;
	stdout: string;
}

interface PublishProductReleaseOptions {
	version: string;
	assetPath: string;
	releaseNotes: string;
	githubSha: string | undefined;
	runGh: (arguments_: string[]) => GitHubCliResult;
}

interface PackageManifest {
	name: string;
	version: string;
}

interface CmsReleaseRegistryModule {
	createCmsReleaseCatalog(packageVersion: string): unknown;
}

function productArchiveName(version: string): string {
	return `kyudaisai-cms-${version}.tgz`;
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

export function planProductRelease(
	version: string,
	existingRelease: GitHubReleaseState | undefined,
	assetName: string,
): ProductReleasePlan {
	if (valid(version) !== version) {
		throw new Error(`CMS package version is not valid SemVer: ${version}`);
	}

	const tagName = `v${version}`;
	const isPrerelease = prerelease(version) !== null;
	if (version === "0.0.0") return { action: "skip", prerelease: isPrerelease, tagName };
	if (!existingRelease) return { action: "create", prerelease: isPrerelease, tagName };
	if (
		typeof existingRelease.isDraft !== "boolean" ||
		typeof existingRelease.isPrerelease !== "boolean" ||
		!Array.isArray(existingRelease.assets)
	) {
		throw new Error(`GitHub Release ${tagName} has an invalid response.`);
	}
	if (existingRelease.isPrerelease !== isPrerelease) {
		throw new Error(
			`GitHub Release ${tagName} has a prerelease status that does not match SemVer.`,
		);
	}

	if (existingRelease.assets.includes(assetName)) {
		return {
			action: existingRelease.isDraft ? "publish" : "skip",
			prerelease: isPrerelease,
			tagName,
		};
	}
	if (existingRelease.isDraft) return { action: "upload", prerelease: isPrerelease, tagName };

	throw new Error(
		`Published GitHub Release ${tagName} is missing ${assetName}; refusing to modify it.`,
	);
}

export async function publishProductRelease({
	version,
	assetPath,
	releaseNotes,
	githubSha,
	runGh,
}: PublishProductReleaseOptions): Promise<"published" | "skipped"> {
	if (!releaseNotes.trim()) {
		throw new Error(`Generated Changesets release notes are missing for ${version}.`);
	}
	const assetName = productArchiveName(version);
	let plan = planProductRelease(version, undefined, assetName);
	if (plan.action === "skip") return "skipped";
	if (typeof githubSha !== "string" || !/^[0-9a-f]{40}$/i.test(githubSha)) {
		throw new Error("GITHUB_SHA must contain the full commit SHA for the Release tag.");
	}

	const viewArguments = [
		"release",
		"view",
		plan.tagName,
		"--json",
		"assets,isDraft,isPrerelease,targetCommitish",
	];
	const viewResult = runGh(viewArguments);
	let existingRelease: GitHubReleaseState | undefined;
	if (viewResult.status === 0) existingRelease = parseReleaseView(viewResult.stdout, plan.tagName);

	plan = planProductRelease(version, existingRelease, assetName);
	if (plan.action === "skip") return "skipped";
	if (
		existingRelease?.isDraft &&
		(typeof existingRelease.targetCommitish !== "string" ||
			existingRelease.targetCommitish.toLowerCase() !== githubSha.toLowerCase())
	) {
		throw new Error(
			`Draft GitHub Release ${plan.tagName} targets ${existingRelease.targetCommitish}; expected ${githubSha}.`,
		);
	}

	if (plan.action === "create") {
		await using notesDirectory = await mkdtempDisposable(join(tmpdir(), "cms-release-notes-"));
		const notesFile = join(notesDirectory.path, "release-notes.md");
		await writeFile(notesFile, `${releaseNotes.trim()}\n`);
		const createArguments = [
			"release",
			"create",
			plan.tagName,
			"--draft",
			"--target",
			githubSha,
			"--title",
			`CMS CLI ${version}`,
			"--notes-file",
			notesFile,
		];
		if (plan.prerelease) createArguments.push("--prerelease");
		runGhSuccessfully(runGh, createArguments);
		existingRelease = {
			assets: [],
			isDraft: true,
			isPrerelease: plan.prerelease,
			targetCommitish: githubSha,
		};
		plan = planProductRelease(version, existingRelease, assetName);
	}

	if (plan.action === "upload") {
		if (!existingRelease) throw new Error(`GitHub Release ${plan.tagName} was not found.`);
		runGhSuccessfully(runGh, ["release", "upload", plan.tagName, assetPath]);
		existingRelease = {
			...existingRelease,
			assets: [...existingRelease.assets, assetName],
			isDraft: true,
		};
		plan = planProductRelease(version, existingRelease, assetName);
	}

	if (plan.action === "publish") {
		runGhSuccessfully(runGh, ["release", "edit", plan.tagName, "--draft=false"]);
		return "published";
	}

	throw new Error(`Unexpected GitHub Release action: ${plan.action}`);
}

function parseReleaseView(output: string, tagName: string): GitHubReleaseState {
	let value: unknown;
	try {
		value = JSON.parse(output);
	} catch {
		throw new Error(`GitHub Release ${tagName} returned invalid JSON.`);
	}
	if (
		!isRecord(value) ||
		typeof value.isDraft !== "boolean" ||
		typeof value.isPrerelease !== "boolean"
	) {
		throw new Error(`GitHub Release ${tagName} has an invalid response.`);
	}
	if (!Array.isArray(value.assets))
		throw new Error(`GitHub Release ${tagName} has invalid assets.`);

	const assets = value.assets.map((asset) => {
		if (!isRecord(asset) || typeof asset.name !== "string") {
			throw new Error(`GitHub Release ${tagName} has an invalid asset.`);
		}
		return asset.name;
	});

	return {
		assets,
		isDraft: value.isDraft,
		isPrerelease: value.isPrerelease,
		targetCommitish: typeof value.targetCommitish === "string" ? value.targetCommitish : undefined,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCmsReleaseRegistryModule(value: unknown): value is CmsReleaseRegistryModule {
	return isRecord(value) && typeof value.createCmsReleaseCatalog === "function";
}

function runGhSuccessfully(
	runGh: (arguments_: string[]) => GitHubCliResult,
	arguments_: string[],
): void {
	const result = runGh(arguments_);
	if (result.status !== 0) {
		const detail = result.stderr.trim();
		throw new Error(
			`gh ${arguments_.join(" ")} failed with status ${result.status}${detail ? `: ${detail}` : "."}`,
		);
	}
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

function runGh(arguments_: string[]): GitHubCliResult {
	const result = spawnSync("gh", arguments_, {
		cwd: repositoryRoot,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	if (result.error) return { status: 1, stderr: result.error.message, stdout: "" };
	return {
		status: result.status ?? 1,
		stderr: result.stderr ?? "",
		stdout: result.stdout ?? "",
	};
}

async function main(): Promise<void> {
	const version = readProductVersion();
	const initialPlan = planProductRelease(version, undefined, productArchiveName(version));
	if (initialPlan.action === "skip") {
		console.log("Skipping product release for the unpublished 0.0.0 development version.");
		return;
	}
	const releaseNotes = readProductReleaseNotes(version);

	const releaseRegistryPath = new URL("../dist/migration/release-registry.js", import.meta.url);
	const releaseRegistryModule: unknown = await import(releaseRegistryPath.href);
	if (!isCmsReleaseRegistryModule(releaseRegistryModule)) {
		throw new Error("The built CMS schema release registry does not expose its catalog factory.");
	}
	releaseRegistryModule.createCmsReleaseCatalog(version);

	const destination = resolve(repositoryRoot, process.argv[2] ?? "dist/release");
	const assetName = productArchiveName(version);
	const assetPath = join(destination, assetName);
	if (!existsSync(assetPath)) throw new Error(`Product archive does not exist: ${assetPath}`);
	if (basename(assetPath) !== assetName) {
		throw new Error(`Unexpected product archive name: ${assetPath}`);
	}

	const result = await publishProductRelease({
		assetPath,
		githubSha: process.env.GITHUB_SHA,
		releaseNotes,
		runGh,
		version,
	});
	console.log(
		result === "published"
			? `Published ${initialPlan.tagName}.`
			: `Skipped ${initialPlan.tagName}.`,
	);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((error: unknown) => {
		console.error(error);
		process.exitCode = 1;
	});
}
