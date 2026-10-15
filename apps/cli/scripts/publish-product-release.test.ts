import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtempDisposable, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { planProductRelease, publishProductRelease } from "./publish-product-release.js";

interface ReleaseState {
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

const version = "0.1.0-alpha.0";
const assetName = `repo-cli-${version}.tgz`;
const githubSha = "1234567890abcdef1234567890abcdef12345678";

function createReleaseState(options: Partial<ReleaseState> = {}): ReleaseState {
	return {
		assets: [],
		isDraft: false,
		isPrerelease: true,
		targetCommitish: githubSha,
		...options,
	};
}

function createGhRunner(initialRelease: ReleaseState | undefined) {
	let release = initialRelease;
	const calls: string[][] = [];
	function runGh(arguments_: string[]): GitHubCliResult {
		calls.push(arguments_);
		const [command, action] = arguments_;
		if (command === "release" && action === "view") {
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
		if (command === "release" && action === "create") {
			release = createReleaseState({
				isDraft: true,
				isPrerelease: arguments_.includes("--prerelease"),
				targetCommitish: arguments_[arguments_.indexOf("--target") + 1],
			});
			return { status: 0, stderr: "", stdout: "" };
		}
		if (command === "release" && action === "upload") {
			if (!release) throw new Error("A release must exist before uploading an asset.");
			release.assets.push(assetName);
			return { status: 0, stderr: "", stdout: "" };
		}
		if (command === "release" && action === "edit") {
			if (!release) throw new Error("A release must exist before publishing it.");
			release.isDraft = false;
			return { status: 0, stderr: "", stdout: "" };
		}
		throw new Error(`Unexpected gh call: ${arguments_.join(" ")}`);
	}
	function getRelease(): ReleaseState | undefined {
		return release;
	}
	return { calls, getRelease, runGh };
}

function getCall(calls: string[][], index: number): string[] {
	const call = calls[index];
	if (!call) throw new Error(`Expected GitHub CLI call at index ${index}.`);
	return call;
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
		expect(getCall(gh.calls, 0)).toEqual([
			"release",
			"view",
			`v${version}`,
			"--json",
			"assets,isDraft,isPrerelease,targetCommitish",
		]);
		const createCall = getCall(gh.calls, 1);
		expect(createCall).toContain("--prerelease");
		expect(createCall[createCall.indexOf("--target") + 1]).toBe(githubSha);
		expect(getCall(gh.calls, 2)).toEqual(["release", "upload", `v${version}`, `/tmp/${assetName}`]);
		expect(getCall(gh.calls, 3)).toEqual(["release", "edit", `v${version}`, "--draft=false"]);
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
		expect(gh.getRelease()?.assets).toEqual([assetName]);
	});

	it("refuses to publish a draft created from a different commit", () => {
		const differentCommit = "abcdef0123456789abcdef0123456789abcdef01";
		const gh = createGhRunner(
			createReleaseState({ assets: [], isDraft: true, targetCommitish: differentCommit }),
		);

		expect(() =>
			publishProductRelease({
				assetPath: `/tmp/${assetName}`,
				githubSha,
				runGh: gh.runGh,
				version,
			}),
		).toThrow(`Draft GitHub Release v${version} targets ${differentCommit}`);
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
		const entryPoint = join(fixtureScripts, "publish-product-release.ts");
		await copyFile(new URL("./publish-product-release.ts", import.meta.url), entryPoint);

		const manifests = [
			{ name: "@repo/cli", relativePath: "apps/cli/package.json" },
			{ name: "@repo/web", relativePath: "apps/web/package.json" },
			{ name: "@repo/api", relativePath: "packages/api/package.json" },
			{ name: "@repo/core", relativePath: "packages/core/package.json" },
			{ name: "@repo/editor", relativePath: "packages/editor/package.json" },
			{ name: "@repo/config", relativePath: "packages/config/package.json" },
		];
		for (const { name, relativePath } of manifests) {
			const manifestPath = join(fixture.path, relativePath);
			await mkdir(dirname(manifestPath), { recursive: true });
			await writeFile(
				manifestPath,
				JSON.stringify({ name, private: true, type: "module", version: "0.0.0" }),
			);
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
