import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import semver from "semver";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../");
const packageManifests = [
	["@repo/cli", "apps/cli/package.json"],
	["@repo/web", "apps/web/package.json"],
	["@repo/api", "packages/api/package.json"],
	["@repo/core", "packages/core/package.json"],
	["@repo/editor", "packages/editor/package.json"],
	["@repo/config", "packages/config/package.json"],
];

export function planProductRelease(version, existingRelease, assetName) {
	if (semver.valid(version) !== version) {
		throw new Error(`CMS package version is not valid SemVer: ${version}`);
	}

	const tagName = `v${version}`;
	const prerelease = semver.prerelease(version) !== null;
	if (version === "0.0.0") return { action: "skip", prerelease, tagName };
	if (!existingRelease) return { action: "create", prerelease, tagName };
	if (
		typeof existingRelease.isDraft !== "boolean" ||
		typeof existingRelease.isPrerelease !== "boolean" ||
		!Array.isArray(existingRelease.assets)
	) {
		throw new Error(`GitHub Release ${tagName} has an invalid response.`);
	}
	if (existingRelease.isPrerelease !== prerelease) {
		throw new Error(
			`GitHub Release ${tagName} has a prerelease status that does not match SemVer.`,
		);
	}

	if (existingRelease.assets.includes(assetName)) {
		return { action: existingRelease.isDraft ? "publish" : "skip", prerelease, tagName };
	}
	if (existingRelease.isDraft) return { action: "upload", prerelease, tagName };

	throw new Error(
		`Published GitHub Release ${tagName} is missing ${assetName}; refusing to modify it.`,
	);
}

export function publishProductRelease({ version, assetPath, githubSha, runGh }) {
	const assetName = `repo-cli-${version}.tgz`;
	let plan = planProductRelease(version, undefined, assetName);
	if (plan.action === "skip") return "skipped";
	if (!/^[0-9a-f]{40}$/i.test(githubSha)) {
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
	let existingRelease;
	if (viewResult.status === 0) {
		const release = JSON.parse(viewResult.stdout);
		existingRelease = {
			assets: release.assets.map((asset) => asset.name),
			isDraft: release.isDraft,
			isPrerelease: release.isPrerelease,
			targetCommitish: release.targetCommitish,
		};
	}

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
		const createArguments = [
			"release",
			"create",
			plan.tagName,
			"--draft",
			"--target",
			githubSha,
			"--title",
			`CMS CLI ${version}`,
			"--notes",
			"CMS CLI product tarballを配布します。",
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
		runGhSuccessfully(runGh, ["release", "upload", plan.tagName, assetPath]);
		existingRelease = {
			assets: [...existingRelease.assets, assetName],
			isDraft: true,
			isPrerelease: plan.prerelease,
		};
		plan = planProductRelease(version, existingRelease, assetName);
	}

	if (plan.action === "publish") {
		runGhSuccessfully(runGh, ["release", "edit", plan.tagName, "--draft=false"]);
		return "published";
	}

	throw new Error(`Unexpected GitHub Release action: ${plan.action}`);
}

function runGhSuccessfully(runGh, arguments_) {
	const result = runGh(arguments_);
	if (result.status !== 0) {
		const detail = result.stderr.trim();
		throw new Error(
			`gh ${arguments_.join(" ")} failed with status ${result.status}${detail ? `: ${detail}` : "."}`,
		);
	}
}

function readProductVersion() {
	const manifests = packageManifests.map(([expectedName, relativePath]) => {
		const manifest = JSON.parse(readFileSync(join(repositoryRoot, relativePath), "utf8"));
		if (manifest.name !== expectedName || manifest.private !== true) {
			throw new Error(`Expected private workspace package ${expectedName} in ${relativePath}.`);
		}
		return { name: expectedName, version: manifest.version };
	});
	const version = manifests[0].version;
	if (manifests.some((manifest) => manifest.version !== version)) {
		throw new Error(
			"CMS product workspace packages must all have the same version before release.",
		);
	}
	return version;
}

function runGh(arguments_) {
	const result = spawnSync("gh", arguments_, {
		cwd: repositoryRoot,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	if (result.error) {
		return { status: 1, stderr: result.error.message, stdout: "" };
	}
	return {
		status: result.status ?? 1,
		stderr: result.stderr ?? "",
		stdout: result.stdout ?? "",
	};
}

async function main() {
	const version = readProductVersion();
	const initialPlan = planProductRelease(version, undefined, `repo-cli-${version}.tgz`);
	if (initialPlan.action === "skip") {
		console.log("Skipping product release for the unpublished 0.0.0 development version.");
		return;
	}

	const { createCmsReleaseCatalog } = await import("../dist/migration/release-registry.js");
	createCmsReleaseCatalog(version);

	const destination = resolve(repositoryRoot, process.argv[2] ?? "dist/release");
	const assetName = `repo-cli-${version}.tgz`;
	const assetPath = join(destination, assetName);
	if (!existsSync(assetPath)) throw new Error(`Product archive does not exist: ${assetPath}`);
	if (basename(assetPath) !== assetName)
		throw new Error(`Unexpected product archive name: ${assetPath}`);

	const result = publishProductRelease({
		assetPath,
		githubSha: process.env.GITHUB_SHA,
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
	main().catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
}
