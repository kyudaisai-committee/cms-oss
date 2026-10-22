import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { chmod, mkdtempDisposable, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

interface FakeReleaseAsset {
	name: string;
}

export interface FakeRelease {
	tag_name: string;
	draft: boolean;
	prerelease: boolean;
	target_commitish: string;
	assets: FakeReleaseAsset[];
}

interface FakeGitHubState {
	releases: FakeRelease[];
	calls: string[][];
	apiFailure?: string;
	createdNotes?: string;
}

export interface WorkflowRunOptions {
	releases?: FakeRelease[];
	apiFailure?: string;
	skip?: boolean;
	version?: string;
	prerelease?: boolean;
	githubSha?: string;
}

export interface WorkflowRunResult {
	exitCode: number | null;
	stdout: string;
	stderr: string;
	state: FakeGitHubState;
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../");
const workflowPath = join(repositoryRoot, ".github/workflows/release.yml");

export const releaseVersion = "1.2.3-beta.1";
export const releaseTagName = `v${releaseVersion}`;
export const releaseGithubSha = "1234567890abcdef1234567890abcdef12345678";
export const releaseAssetName = `kyudaisai-cms-${releaseVersion}.tgz`;
export const releaseNotes = "### Minor Changes\n\n- Initial CMS product release.\n";

const fakeGhSource = `#!/usr/bin/env node
const { basename } = require("node:path");
const { readFileSync, writeFileSync } = require("node:fs");
const statePath = process.env.CMS_RELEASE_FIXTURE_STATE;
const state = JSON.parse(readFileSync(statePath, "utf8"));
const args = process.argv.slice(2);
state.calls.push(args);

function fail(message) {
  process.stderr.write(message + "\\n");
  writeFileSync(statePath, JSON.stringify(state));
  process.exitCode = 1;
}

if (args[0] === "api") {
  if (state.apiFailure) {
    fail(state.apiFailure);
  } else {
    process.stdout.write(state.releases.map((release) => JSON.stringify(release)).join("\\n"));
    writeFileSync(statePath, JSON.stringify(state));
  }
} else if (args[0] === "release" && args[1] === "create") {
  const valueAfter = (name) => args[args.indexOf(name) + 1];
  const notesPath = valueAfter("--notes-file");
  if (!notesPath) {
    fail("release create was missing --notes-file");
  } else {
    state.createdNotes = readFileSync(notesPath, "utf8");
    state.releases.push({
      tag_name: args[2],
      draft: true,
      prerelease: args.includes("--prerelease"),
      target_commitish: valueAfter("--target"),
      assets: [],
    });
    writeFileSync(statePath, JSON.stringify(state));
  }
} else if (args[0] === "release" && args[1] === "upload") {
  const release = state.releases.find((item) => item.tag_name === args[2]);
  if (!release) {
    fail("release upload target was not found");
  } else {
    release.assets.push({ name: basename(args[3]) });
    writeFileSync(statePath, JSON.stringify(state));
  }
} else if (args[0] === "release" && args[1] === "edit") {
  const release = state.releases.find((item) => item.tag_name === args[2]);
  if (!release) {
    fail("release edit target was not found");
  } else {
    if (args.includes("--draft=false")) release.draft = false;
    writeFileSync(statePath, JSON.stringify(state));
  }
} else {
  fail("unexpected gh call: " + args.join(" "));
}
`;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFakeReleaseAsset(value: unknown): value is FakeReleaseAsset {
	return isRecord(value) && typeof value.name === "string";
}

function isFakeRelease(value: unknown): value is FakeRelease {
	return (
		isRecord(value) &&
		typeof value.tag_name === "string" &&
		typeof value.draft === "boolean" &&
		typeof value.prerelease === "boolean" &&
		typeof value.target_commitish === "string" &&
		Array.isArray(value.assets) &&
		value.assets.every(isFakeReleaseAsset)
	);
}

function isFakeGitHubState(value: unknown): value is FakeGitHubState {
	return (
		isRecord(value) &&
		Array.isArray(value.releases) &&
		value.releases.every(isFakeRelease) &&
		Array.isArray(value.calls) &&
		value.calls.every(
			(call) => Array.isArray(call) && call.every((part) => typeof part === "string"),
		) &&
		(value.apiFailure === undefined || typeof value.apiFailure === "string") &&
		(value.createdNotes === undefined || typeof value.createdNotes === "string")
	);
}

function findReleaseStep(): string {
	const workflow: unknown = parse(readFileSync(workflowPath, "utf8"));
	if (!isRecord(workflow) || !isRecord(workflow.jobs) || !isRecord(workflow.jobs.release)) {
		throw new Error("The release workflow job is missing.");
	}
	const steps = workflow.jobs.release.steps;
	if (!Array.isArray(steps)) throw new Error("The release workflow steps are missing.");
	const releaseStep = steps.find(
		(step) =>
			isRecord(step) &&
			step.name === "Create or update GitHub Release" &&
			typeof step.run === "string",
	);
	if (!isRecord(releaseStep) || typeof releaseStep.run !== "string") {
		throw new Error("The direct GitHub Release workflow step is missing.");
	}
	return releaseStep.run;
}

export function createRelease(options: Partial<FakeRelease> = {}): FakeRelease {
	return {
		tag_name: releaseTagName,
		draft: false,
		prerelease: true,
		target_commitish: releaseGithubSha,
		assets: [],
		...options,
	};
}

export async function runReleaseWorkflow(
	options: WorkflowRunOptions = {},
): Promise<WorkflowRunResult> {
	await using fixture = await mkdtempDisposable(join(tmpdir(), "cms-release-workflow-"));
	const binDirectory = join(fixture.path, "bin");
	await mkdir(binDirectory);
	const ghPath = join(binDirectory, "gh");
	await writeFile(ghPath, fakeGhSource);
	await chmod(ghPath, 0o755);

	const selectedVersion = options.version ?? releaseVersion;
	const assetName = `kyudaisai-cms-${selectedVersion}.tgz`;
	const assetPath = join(fixture.path, assetName);
	const notesPath = join(fixture.path, "release-notes.md");
	await writeFile(assetPath, "archive");
	await writeFile(notesPath, releaseNotes);

	const statePath = join(fixture.path, "state.json");
	const state: FakeGitHubState = {
		releases: structuredClone(options.releases ?? []),
		calls: [],
		...(options.apiFailure ? { apiFailure: options.apiFailure } : {}),
	};
	await writeFile(statePath, JSON.stringify(state));

	const result = spawnSync(
		"/bin/bash",
		["--noprofile", "--norc", "-e", "-u", "-o", "pipefail", "-c", findReleaseStep()],
		{
			cwd: repositoryRoot,
			encoding: "utf8",
			env: {
				...process.env,
				PATH: `${binDirectory}${delimiter}${process.env.PATH ?? ""}`,
				CMS_RELEASE_FIXTURE_STATE: statePath,
				GITHUB_REPOSITORY: "owner/repo",
				GITHUB_SHA: options.githubSha ?? releaseGithubSha,
				RELEASE_VERSION: selectedVersion,
				RELEASE_TAG_NAME: `v${selectedVersion}`,
				RELEASE_ASSET_NAME: assetName,
				RELEASE_ASSET_PATH: assetPath,
				RELEASE_NOTES_PATH: notesPath,
				RELEASE_PRERELEASE: String(options.prerelease ?? true),
				RELEASE_SKIP: String(options.skip ?? false),
			},
		},
	);

	const parsedState: unknown = JSON.parse(await readFile(statePath, "utf8"));
	if (!isFakeGitHubState(parsedState)) throw new Error("The fake GitHub state is invalid.");
	return {
		exitCode: result.status,
		stdout: result.stdout,
		stderr: result.stderr,
		state: parsedState,
	};
}
