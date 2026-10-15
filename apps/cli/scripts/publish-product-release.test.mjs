import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtempDisposable, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { planProductRelease, publishProductRelease } from "./publish-product-release.mjs";

const version = "0.1.0-alpha.0";
const assetName = `repo-cli-${version}.tgz`;
const githubSha = "1234567890abcdef1234567890abcdef12345678";

function createReleaseState({
	assets = [],
	isDraft = false,
	isPrerelease = true,
	targetCommitish = githubSha,
} = {}) {
	return { assets, isDraft, isPrerelease, targetCommitish };
}

function createGhRunner(initialRelease) {
	let release = initialRelease;
	const calls = [];
	function runGh(arguments_) {
		calls.push(arguments_);
		if (arguments_[0] === "release" && arguments_[1] === "view") {
			return release
				? {
						status: 0,
						stderr: "",
						stdout: JSON.stringify({
							assets: release.assets.map((name) => ({ name })),
							isDraft: release.isDraft,
							isPrerelease: release.isPrerelease,
							targetCommitish: release.targetCommitish,
						}),
					}
				: { status: 1, stderr: "release not found", stdout: "" };
		}
		if (arguments_[0] === "release" && arguments_[1] === "create") {
			release = createReleaseState({
				isDraft: true,
				isPrerelease: arguments_.includes("--prerelease"),
				targetCommitish: arguments_[arguments_.indexOf("--target") + 1],
			});
			return { status: 0, stderr: "", stdout: "" };
		}
		if (arguments_[0] === "release" && arguments_[1] === "upload") {
			release.assets.push(assetName);
			return { status: 0, stderr: "", stdout: "" };
		}
		if (arguments_[0] === "release" && arguments_[1] === "edit") {
			release.isDraft = false;
			return { status: 0, stderr: "", stdout: "" };
		}
		throw new Error(`Unexpected gh call: ${arguments_.join(" ")}`);
	}
	return { calls, getRelease: () => release, runGh };
}

describe("product release decisions", () => {
	it("skips the unpublished development version", () => {
		expect(planProductRelease("0.0.0", undefined, "repo-cli-0.0.0.tgz")).toEqual({
			action: "skip",
			prerelease: false,
			tagName: "v0.0.0",
		});
	});

	it("marks stable SemVer versions as regular Releases", () => {
		expect(planProductRelease("1.0.0", undefined, "repo-cli-1.0.0.tgz")).toEqual({
			action: "create",
			prerelease: false,
			tagName: "v1.0.0",
		});
	});

	it("creates a prerelease, uploads the product archive, then publishes it", () => {
		const gh = createGhRunner(undefined);
		const result = publishProductRelease({
			assetPath: `/tmp/${assetName}`,
			githubSha,
			runGh: gh.runGh,
			version,
		});

		expect(result).toBe("published");
		expect(gh.getRelease()).toEqual(createReleaseState({ assets: [assetName], isDraft: false }));
		expect(gh.calls.map((call) => call[1])).toEqual(["view", "create", "upload", "edit"]);
		expect(gh.calls[0]).toEqual([
			"release",
			"view",
			`v${version}`,
			"--json",
			"assets,isDraft,isPrerelease,targetCommitish",
		]);
		expect(gh.calls[1]).toContain("--prerelease");
		expect(gh.calls[1][gh.calls[1].indexOf("--target") + 1]).toBe(githubSha);
		expect(gh.calls[2]).toEqual(["release", "upload", `v${version}`, `/tmp/${assetName}`]);
		expect(gh.calls[3]).toEqual(["release", "edit", `v${version}`, "--draft=false"]);
	});

	it("recovers a draft with a missing asset without replacing an existing release", () => {
		const gh = createGhRunner(createReleaseState({ assets: [], isDraft: true }));
		const result = publishProductRelease({
			assetPath: `/tmp/${assetName}`,
			githubSha,
			runGh: gh.runGh,
			version,
		});

		expect(result).toBe("published");
		expect(gh.calls.map((call) => call[1])).toEqual(["view", "upload", "edit"]);
		expect(gh.getRelease().assets).toEqual([assetName]);
	});

	it("refuses to publish a draft created from a different commit", () => {
		const gh = createGhRunner(
			createReleaseState({
				assets: [],
				isDraft: true,
				targetCommitish: "abcdef0123456789abcdef0123456789abcdef01",
			}),
		);

		expect(() =>
			publishProductRelease({
				assetPath: `/tmp/${assetName}`,
				githubSha,
				runGh: gh.runGh,
				version,
			}),
		).toThrow(`Draft GitHub Release v${version} targets abcdef0123456789abcdef0123456789abcdef01`);
		expect(gh.calls.map((call) => call[1])).toEqual(["view"]);
	});

	it("skips a published release that already has its archive", () => {
		const gh = createGhRunner(createReleaseState({ assets: [assetName] }));
		const result = publishProductRelease({
			assetPath: `/tmp/${assetName}`,
			githubSha,
			runGh: gh.runGh,
			version,
		});

		expect(result).toBe("skipped");
		expect(gh.calls.map((call) => call[1])).toEqual(["view"]);
	});

	it("fails closed when a published release is missing its archive", () => {
		const gh = createGhRunner(createReleaseState({ assets: [] }));

		expect(() =>
			publishProductRelease({
				assetPath: `/tmp/${assetName}`,
				githubSha,
				runGh: gh.runGh,
				version,
			}),
		).toThrow(`Published GitHub Release v${version} is missing ${assetName}`);
		expect(gh.calls.map((call) => call[1])).toEqual(["view"]);
	});

	it("rejects a prerelease flag that disagrees with SemVer", () => {
		expect(() =>
			planProductRelease(version, createReleaseState({ isPrerelease: false }), assetName),
		).toThrow(`GitHub Release v${version} has a prerelease status that does not match SemVer.`);
	});

	it("runs the release entry point against a disposable unpublished repository fixture", async () => {
		await using fixture = await mkdtempDisposable(join(tmpdir(), "cms-release-entry-"));
		const fixtureCli = join(fixture.path, "apps/cli");
		const fixtureScripts = join(fixtureCli, "scripts");
		await mkdir(fixtureScripts, { recursive: true });
		await symlink(
			resolve(dirname(fileURLToPath(import.meta.url)), "../node_modules"),
			join(fixtureCli, "node_modules"),
			"dir",
		);
		const entryPoint = join(fixtureScripts, "publish-product-release.mjs");
		await copyFile(new URL("./publish-product-release.mjs", import.meta.url), entryPoint);

		const manifests = [
			["@repo/cli", "apps/cli/package.json"],
			["@repo/web", "apps/web/package.json"],
			["@repo/api", "packages/api/package.json"],
			["@repo/core", "packages/core/package.json"],
			["@repo/editor", "packages/editor/package.json"],
			["@repo/config", "packages/config/package.json"],
		];
		for (const [name, relativePath] of manifests) {
			const manifestPath = join(fixture.path, relativePath);
			await mkdir(dirname(manifestPath), { recursive: true });
			await writeFile(manifestPath, JSON.stringify({ name, private: true, version: "0.0.0" }));
		}

		const result = spawnSync(process.execPath, [await realpath(entryPoint)], {
			cwd: fixture.path,
			encoding: "utf8",
			env: { ...process.env, GITHUB_SHA: githubSha },
		});
		expect(result.status).toBe(0);
		expect(result.stdout).toBe(
			"Skipping product release for the unpublished 0.0.0 development version.\n",
		);
		expect(result.stderr).toBe("");
	});
});
