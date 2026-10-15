import { spawnSync } from "node:child_process";
import { mkdir, mkdtempDisposable, readFile, writeFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { collectProductReleaseNotes, copyProductChangelogs } from "./product-release-notes.js";

const productVersion = "0.1.0-alpha.1";
const previousVersion = "0.1.0-alpha.0";
const markdownTick = String.fromCharCode(96);
const markdownFence = markdownTick.repeat(3);
const packageChangelogs = [
	{ name: "cli", relativePath: "apps/cli/CHANGELOG.md", archiveName: "cli.md" },
	{ name: "web", relativePath: "apps/web/CHANGELOG.md", archiveName: "web.md" },
	{ name: "api", relativePath: "packages/api/CHANGELOG.md", archiveName: "api.md" },
	{ name: "core", relativePath: "packages/core/CHANGELOG.md", archiveName: "core.md" },
	{ name: "editor", relativePath: "packages/editor/CHANGELOG.md", archiveName: "editor.md" },
	{ name: "config", relativePath: "packages/config/CHANGELOG.md", archiveName: "config.md" },
];

function makeChangelog(packageName: string, currentSection: string): string {
	return `# @repo/${packageName}

## ${productVersion}

${currentSection}

## ${previousVersion}

### Minor Changes

- Earlier product change.
`;
}

describe("product release notes", () => {
	it("combines identical first-release entries from all fixed packages once", () => {
		const changelogs = packageChangelogs.map(({ name }) =>
			makeChangelog(
				name,
				`### Minor Changes

- Initial CMS product release.

### Patch Changes

- Updated dependencies [abc1234]:
  - @repo/core@${productVersion}`,
			),
		);

		expect(collectProductReleaseNotes(productVersion, changelogs)).toBe(
			"### Minor Changes\n\n- Initial CMS product release.",
		);
	});

	it("keeps an editor-only release and its multiline database instructions", () => {
		const databaseInstructions = [
			"### Minor Changes",
			"",
			"- Add keyboard navigation to the editor.",
			"",
			"### Patch Changes",
			"",
			`- Update existing databases from ${markdownTick}core-schema-v1${markdownTick} to ${markdownTick}core-schema-v2${markdownTick}. Preserve record IDs and foreign-key relationships. Convert missing dates to UTC midnight. Apply this migration after backing up the database, then verify record counts and references.`,
			"",
			`  ${markdownFence}sql`,
			"  UPDATE records SET created_at = '1970-01-01T00:00:00.000Z' WHERE created_at IS NULL;",
			`  ${markdownFence}`,
		].join("\n");
		const changelogs = packageChangelogs.map(({ name }) =>
			makeChangelog(
				name,
				name === "editor"
					? databaseInstructions
					: `### Patch Changes

- Updated dependencies [abc1234]:
  - @repo/editor@${productVersion}`,
			),
		);

		expect(collectProductReleaseNotes(productVersion, changelogs)).toBe(databaseInstructions);
	});

	it("returns no notes when the target version is absent or only internal dependencies changed", () => {
		expect(
			collectProductReleaseNotes(productVersion, [
				`# @repo/cli\n\n## ${previousVersion}\n\n### Minor Changes\n\n- Earlier release.\n`,
			]),
		).toBe("");
		expect(
			collectProductReleaseNotes(productVersion, [
				makeChangelog(
					"cli",
					`### Patch Changes\n\n- Updated dependencies [abc1234]:\n  - @repo/core@${productVersion}`,
				),
			]),
		).toBe("");
	});

	it("copies complete workspace history into the versioned product tarball", async () => {
		await using fixture = await mkdtempDisposable(join(tmpdir(), "cms-product-changelogs-"));
		const repositoryRoot = join(fixture.path, "source");
		const productDirectory = join(fixture.path, "product");
		const changelogs = new Map<string, string>();

		for (const { name, relativePath } of packageChangelogs) {
			const content = makeChangelog(name, "### Minor Changes\n\n- Product change.");
			const sourcePath = join(repositoryRoot, relativePath);
			await mkdir(dirname(sourcePath), { recursive: true });
			await writeFile(sourcePath, content);
			changelogs.set(name, content);
		}

		await copyProductChangelogs(productVersion, repositoryRoot, productDirectory);

		for (const { name, archiveName } of packageChangelogs) {
			expect(await readFile(join(productDirectory, "changelogs", archiveName), "utf8")).toBe(
				changelogs.get(name),
			);
		}

		await writeFile(
			join(productDirectory, "package.json"),
			JSON.stringify({
				name: "@repo/cli",
				version: productVersion,
				files: ["changelogs"],
			}),
		);
		const archiveDirectory = join(fixture.path, "archive");
		await mkdir(archiveDirectory);
		const packResult = spawnSync("pnpm", ["pack", "--pack-destination", archiveDirectory], {
			cwd: productDirectory,
			encoding: "utf8",
		});
		expect(packResult.status, packResult.stderr).toBe(0);
		const archiveName = (await readdir(archiveDirectory)).find((name) => name.endsWith(".tgz"));
		if (!archiveName) throw new Error("pnpm pack did not create a product archive.");

		for (const { name, archiveName: changelogName } of packageChangelogs) {
			const archivedFile = spawnSync(
				"tar",
				["-xOzf", join(archiveDirectory, archiveName), `package/changelogs/${changelogName}`],
				{ encoding: "utf8" },
			);
			expect(archivedFile.status, archivedFile.stderr).toBe(0);
			expect(archivedFile.stdout).toBe(changelogs.get(name));
		}
	});
});
