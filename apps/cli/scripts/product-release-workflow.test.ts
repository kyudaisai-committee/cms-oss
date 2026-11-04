import { describe, expect, it } from "vitest";

import {
	createRelease,
	releaseAssetName,
	releaseGithubSha,
	releaseNotes,
	releaseTagName,
	runReleaseWorkflow,
	type FakeRelease,
} from "./product-release-workflow-fixture.ts";

describe("product release workflow", () => {
	it("creates a draft Release, uploads the archive, then publishes it with gh release", async () => {
		const result = await runReleaseWorkflow();

		expect(result.exitCode).toBe(0);
		expect(result.state.calls.map((call) => call[0])).toEqual([
			"api",
			"release",
			"release",
			"release",
		]);
		expect(result.state.calls[0]).toContain("--paginate");
		const createCall = result.state.calls[1];
		expect(createCall?.slice(0, 9)).toEqual([
			"release",
			"create",
			releaseTagName,
			"--draft",
			"--target",
			releaseGithubSha,
			"--title",
			"CMS CLI 1.2.3-beta.1",
			"--notes-file",
		]);
		expect(createCall?.[9]).toMatch(/release-notes\.md$/);
		expect(createCall?.at(-1)).toBe("--prerelease");
		expect(result.state.createdNotes).toBe(releaseNotes);
		expect(result.state.calls[2]?.slice(0, 3)).toEqual(["release", "upload", releaseTagName]);
		expect(result.state.calls[3]).toEqual(["release", "edit", releaseTagName, "--draft=false"]);
		expect(result.state.releases).toContainEqual(
			expect.objectContaining({
				tag_name: releaseTagName,
				draft: false,
				prerelease: true,
				target_commitish: releaseGithubSha,
				assets: [{ name: releaseAssetName }],
			}),
		);
	});

	it("recovers an old draft release from paginated API results", async () => {
		const releases = Array.from({ length: 125 }, (_, index) =>
			createRelease({ tag_name: `v0.${index}.0`, prerelease: false }),
		);
		releases.push(createRelease({ draft: true }));
		const result = await runReleaseWorkflow({ releases });

		expect(result.exitCode).toBe(0);
		expect(result.state.calls[0]).toContain("--paginate");
		expect(result.state.calls.map((call) => call[1])).toEqual(["--paginate", "upload", "edit"]);
		expect(result.state.releases.at(-1)).toMatchObject({
			tag_name: releaseTagName,
			draft: false,
			assets: [{ name: releaseAssetName }],
		});
	});

	it("publishes a matching draft that already contains the archive without replacing it", async () => {
		const result = await runReleaseWorkflow({
			releases: [createRelease({ draft: true, assets: [{ name: releaseAssetName }] })],
		});

		expect(result.exitCode).toBe(0);
		expect(result.state.calls.map((call) => call[1])).toEqual(["--paginate", "edit"]);
		expect(result.state.releases[0]).toMatchObject({
			draft: false,
			assets: [{ name: releaseAssetName }],
		});
	});

	it("skips a published release that already has the archive", async () => {
		const result = await runReleaseWorkflow({
			releases: [createRelease({ assets: [{ name: releaseAssetName }] })],
		});

		expect(result.exitCode).toBe(0);
		expect(result.state.calls.map((call) => call[1])).toEqual(["--paginate"]);
	});

	it("skips the unpublished development version without contacting GitHub", async () => {
		const result = await runReleaseWorkflow({ skip: true, version: "0.0.0", prerelease: false });

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Skipping product release");
		expect(result.state.calls).toEqual([]);
	});

	it.each([
		{
			name: "published Release missing its archive",
			release: createRelease(),
			error: `Published GitHub Release ${releaseTagName} is missing ${releaseAssetName}`,
		},
		{
			name: "draft Release targeting a different commit",
			release: createRelease({
				draft: true,
				target_commitish: "abcdef0123456789abcdef0123456789abcdef01",
			}),
			error: "targets abcdef0123456789abcdef0123456789abcdef01",
		},
		{
			name: "Release with a mismatched prerelease flag",
			release: createRelease({ prerelease: false }),
			error: "has a prerelease status that does not match SemVer",
		},
	] satisfies Array<{ name: string; release: FakeRelease; error: string }>)(
		"refuses to modify a $name",
		async ({ release, error }) => {
			const result = await runReleaseWorkflow({ releases: [release] });

			expect(result.exitCode).not.toBe(0);
			expect(result.stderr).toContain(error);
			expect(result.state.calls.map((call) => call[1])).toEqual(["--paginate"]);
		},
	);

	it("fails closed on API/authentication errors instead of treating them as a missing release", async () => {
		const result = await runReleaseWorkflow({ apiFailure: "HTTP 401: Bad credentials" });

		expect(result.exitCode).not.toBe(0);
		expect(result.stderr).toContain("HTTP 401: Bad credentials");
		expect(result.state.calls.map((call) => call[0])).toEqual(["api"]);
	});
});
