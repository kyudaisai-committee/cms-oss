import {
	access,
	chmod,
	lstat,
	mkdir,
	mkdtempDisposable,
	readFile,
	readlink,
	readdir,
	realpath,
	stat,
	symlink,
	utimes,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { generateCmsProject } from "./generate.js";
import { synchronizeGeneratedProject, writeGenerationManifest } from "./generation-sync.js";
import { resolveProjectPaths } from "./paths.js";

describe("generated consumer project", () => {
	it("keeps user configuration and typegen output outside the generated source references", async () => {
		await using directory = await mkdtempDisposable(join(tmpdir(), "cms-cli-generate-boundaries-"));
		const webSourceDirectory = join(directory.path, "web-source");
		const paths = { ...resolveProjectPaths(directory.path), webSourceDirectory };
		const sourceDirectory = join(paths.cmsDirectory, "src");

		await createWebSource(webSourceDirectory);
		await generateCmsProject(paths);

		expect((await lstat(sourceDirectory)).isSymbolicLink()).toBe(false);
		expect(
			JSON.parse(await readFile(join(paths.cmsDirectory, "package.json"), "utf8")),
		).toMatchObject({
			imports: { "#web/*": "./src/*" },
		});
		expect(
			JSON.parse(await readFile(join(paths.cmsDirectory, "tsconfig.json"), "utf8")),
		).toMatchObject({
			compilerOptions: { paths: { "#web/*": ["./src/*"] } },
			include: expect.arrayContaining(["worker-configuration.d.ts"]),
		});
		await expect(access(join(sourceDirectory, "pages.gen.ts"))).rejects.toMatchObject({
			code: "ENOENT",
		});
		await expect(access(paths.configPath)).rejects.toMatchObject({ code: "ENOENT" });
		await expect(access(paths.drizzleConfigPath)).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("keeps consumer config, migrations, and Wrangler state outside regenerated .cms", async () => {
		await using directory = await mkdtempDisposable(join(tmpdir(), "cms-cli-generate-"));
		const webSourceDirectory = join(directory.path, "web-source");
		const paths = { ...resolveProjectPaths(directory.path), webSourceDirectory };
		await createWebSource(webSourceDirectory);
		const consumerConfig = 'export default { name: "Consumer-owned" };\n';
		const drizzleConfig = 'export default { out: "./migrations" };\n';
		await writeFile(paths.configPath, consumerConfig);
		await writeFile(paths.drizzleConfigPath, drizzleConfig);
		const d1State = join(paths.wranglerStateDirectory, "v3", "state.sqlite");
		await mkdir(join(paths.wranglerStateDirectory, "v3"), { recursive: true });
		await writeFile(d1State, "consumer database state");

		await generateCmsProject(paths);
		expect(await readlink(join(paths.cmsDirectory, "waku.config.ts"))).toBe(
			join(directory.path, "waku.config.ts"),
		);
		expect(await readlink(join(paths.cmsDirectory, "src", "waku.server.ts"))).toBe(
			join(webSourceDirectory, "waku.server.ts"),
		);
		expect(await readlink(join(paths.cmsDirectory, "node_modules", "@repo", "cli"))).toBe(
			paths.packageRoot,
		);
		expect(await realpath(join(paths.cmsDirectory, "node_modules", "@oclif", "core"))).toBe(
			await realpath(join(paths.packageRoot, "node_modules", "@oclif", "core")),
		);
		expect(await readlink(join(paths.cmsDirectory, "node_modules", ".bin"))).toBe(
			join(paths.packageRoot, "node_modules", ".bin"),
		);
		expect(await readlink(join(paths.cmsDirectory, "src", "pages"))).toBe(
			join(webSourceDirectory, "pages"),
		);

		await generateCmsProject(paths);
		expect(await readlink(join(paths.cmsDirectory, "waku.config.ts"))).toBe(
			join(directory.path, "waku.config.ts"),
		);
		expect(await readFile(paths.configPath, "utf8")).toBe(consumerConfig);
		expect(await readFile(paths.drizzleConfigPath, "utf8")).toBe(drizzleConfig);
		expect(await readFile(d1State, "utf8")).toBe("consumer database state");
	});

	it("updates changed files without rewriting other generated files and removes obsolete entries", async () => {
		await using directory = await mkdtempDisposable(join(tmpdir(), "cms-cli-generate-update-"));
		const webSourceDirectory = join(directory.path, "web-source");
		const paths = { ...resolveProjectPaths(directory.path), webSourceDirectory };
		await createWebSource(webSourceDirectory);
		await generateCmsProject(paths);
		const stableFilePath = join(paths.cmsDirectory, "tsconfig.json");
		const obsoletePath = join(paths.cmsDirectory, "src", "obsolete.ts");
		const stableModificationTime = new Date("2000-01-01T00:00:00.000Z");
		await utimes(stableFilePath, stableModificationTime, stableModificationTime);
		await writeFile(obsoletePath, "obsolete generated file");
		const manifestPath = join(paths.cmsDirectory, ".cms-generated.json");
		const manifest: { managedPaths: string[] } = JSON.parse(await readFile(manifestPath, "utf8"));
		manifest.managedPaths.push("src/obsolete.ts");
		await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

		const alternateConfigPath = join(directory.path, "alternate.config.ts");
		await writeFile(alternateConfigPath, "export default {};\n");
		await generateCmsProject({ ...paths, configPath: alternateConfigPath });

		expect(await readlink(join(paths.cmsDirectory, "waku.config.ts"))).toBe(
			join(directory.path, "waku.config.ts"),
		);
		expect((await stat(stableFilePath)).mtimeMs).toBe(stableModificationTime.getTime());
		await expect(access(obsoletePath)).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("restores a previous generated project and removes interrupted generation files", async () => {
		await using directory = await mkdtempDisposable(join(tmpdir(), "cms-cli-generate-recovery-"));
		const webSourceDirectory = join(directory.path, "web-source");
		const paths = { ...resolveProjectPaths(directory.path), webSourceDirectory };
		const backupDirectory = `${paths.cmsDirectory}.old-interrupted`;
		const temporaryDirectory = `${paths.cmsDirectory}.tmp-interrupted`;

		await createWebSource(webSourceDirectory);
		await mkdir(backupDirectory, { recursive: true });
		await writeFile(join(backupDirectory, "recovered-marker"), "previous project");
		await mkdir(temporaryDirectory, { recursive: true });
		await writeFile(join(temporaryDirectory, "partial-file"), "incomplete project");

		await generateCmsProject(paths);

		expect(await readFile(join(paths.cmsDirectory, "recovered-marker"), "utf8")).toBe(
			"previous project",
		);
		expect(await readlink(join(paths.cmsDirectory, "waku.config.ts"))).toBe(
			join(directory.path, "waku.config.ts"),
		);
		await expect(access(temporaryDirectory)).rejects.toMatchObject({ code: "ENOENT" });
		await expect(access(backupDirectory)).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("keeps the previous manifest until obsolete cleanup succeeds", async () => {
		await using directory = await mkdtempDisposable(
			join(tmpdir(), "cms-cli-generate-manifest-recovery-"),
		);
		const sourceDirectory = join(directory.path, "source");
		const destinationDirectory = join(directory.path, ".cms");
		const manifestPath = join(destinationDirectory, ".cms-generated.json");
		const previousManifest = {
			managedPaths: [".cms-generated.json", "blocked/old", "obsolete/file", "package.json"],
		};
		const nextManifest = { managedPaths: [".cms-generated.json", "package.json"] };
		const previousManifestContents = `${JSON.stringify(previousManifest, null, 2)}\n`;

		await mkdir(sourceDirectory, { recursive: true });
		await mkdir(destinationDirectory, { recursive: true });
		await mkdir(join(destinationDirectory, "blocked"), { recursive: true });
		await mkdir(join(destinationDirectory, "obsolete"), { recursive: true });
		await writeFile(join(sourceDirectory, "package.json"), '{"name":"updated"}\n');
		await writeFile(
			join(sourceDirectory, ".cms-generated.json"),
			`${JSON.stringify(nextManifest, null, 2)}\n`,
		);
		await writeFile(manifestPath, previousManifestContents);
		await writeFile(join(destinationDirectory, "package.json"), '{"name":"old"}\n');
		await writeFile(join(destinationDirectory, "blocked", "old"), "obsolete managed file");
		await writeFile(join(destinationDirectory, "obsolete", "file"), "obsolete managed file");
		await chmod(join(destinationDirectory, "blocked"), 0o555);

		try {
			await expect(
				synchronizeGeneratedProject(sourceDirectory, destinationDirectory),
			).rejects.toMatchObject({ code: expect.stringMatching(/EACCES|EPERM/) });
			expect(await readFile(manifestPath, "utf8")).toBe(previousManifestContents);
			expect(await readFile(join(destinationDirectory, "package.json"), "utf8")).toBe(
				'{"name":"updated"}\n',
			);
		} finally {
			await chmod(join(destinationDirectory, "blocked"), 0o755);
		}
		await synchronizeGeneratedProject(sourceDirectory, destinationDirectory);

		expect(await readFile(manifestPath, "utf8")).toBe(`${JSON.stringify(nextManifest, null, 2)}\n`);
		await expect(access(join(destinationDirectory, "blocked", "old"))).rejects.toMatchObject({
			code: "ENOENT",
		});
		await expect(access(join(destinationDirectory, "obsolete", "file"))).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	it("skips obsolete descendants after a generated directory becomes a file", async () => {
		await using directory = await mkdtempDisposable(
			join(tmpdir(), "cms-cli-generate-directory-to-file-"),
		);
		const sourceDirectory = join(directory.path, "source");
		const destinationDirectory = join(directory.path, ".cms");
		const previousManifest = {
			managedPaths: [".cms-generated.json", "runtime", "runtime/keep.txt"],
		};

		await mkdir(sourceDirectory, { recursive: true });
		await mkdir(join(destinationDirectory, "runtime"), { recursive: true });
		await writeFile(join(sourceDirectory, "runtime"), "runtime module");
		await writeFile(
			join(destinationDirectory, ".cms-generated.json"),
			JSON.stringify(previousManifest),
		);
		await writeFile(join(destinationDirectory, "runtime", "keep.txt"), "old generated file");
		await writeGenerationManifest(sourceDirectory);

		await synchronizeGeneratedProject(sourceDirectory, destinationDirectory);

		expect(await readFile(join(destinationDirectory, "runtime"), "utf8")).toBe("runtime module");
		expect(
			JSON.parse(await readFile(join(destinationDirectory, ".cms-generated.json"), "utf8")),
		).toEqual({ managedPaths: [".cms-generated.json", "runtime"] });
	});

	it("does not remove product files through an obsolete path's symlink parent", async () => {
		await using directory = await mkdtempDisposable(
			join(tmpdir(), "cms-cli-generate-symlink-cleanup-"),
		);
		const sourceDirectory = join(directory.path, "source");
		const destinationDirectory = join(directory.path, ".cms");
		const productDirectory = join(directory.path, "product");
		const previousManifest = {
			managedPaths: [".cms-generated.json", "runtime", "runtime/keep.txt"],
		};

		await mkdir(join(destinationDirectory, "runtime"), { recursive: true });
		await mkdir(sourceDirectory, { recursive: true });
		await mkdir(productDirectory, { recursive: true });
		await writeFile(
			join(destinationDirectory, ".cms-generated.json"),
			JSON.stringify(previousManifest),
		);
		await writeFile(join(destinationDirectory, "runtime", "keep.txt"), "old generated file");
		await writeFile(join(productDirectory, "keep.txt"), "product-owned file");
		await symlink(productDirectory, join(sourceDirectory, "runtime"), "dir");
		await writeGenerationManifest(sourceDirectory);

		await synchronizeGeneratedProject(sourceDirectory, destinationDirectory);

		expect((await lstat(join(destinationDirectory, "runtime"))).isSymbolicLink()).toBe(true);
		expect(await readFile(join(productDirectory, "keep.txt"), "utf8")).toBe("product-owned file");
	});

	it("rejects a symlinked generated root without modifying its target", async () => {
		await using directory = await mkdtempDisposable(
			join(tmpdir(), "cms-cli-generate-symlink-root-"),
		);
		const sourceDirectory = join(directory.path, "source");
		const destinationDirectory = join(directory.path, ".cms");
		const productDirectory = join(directory.path, "product");

		await mkdir(sourceDirectory, { recursive: true });
		await mkdir(productDirectory, { recursive: true });
		const productManifest = {
			managedPaths: [".cms-generated.json", "keep.txt"],
		};
		await writeFile(join(productDirectory, ".cms-generated.json"), JSON.stringify(productManifest));
		await writeFile(join(productDirectory, "keep.txt"), "product-owned file");
		await symlink(productDirectory, destinationDirectory, "dir");
		await writeGenerationManifest(sourceDirectory);

		await expect(
			synchronizeGeneratedProject(sourceDirectory, destinationDirectory),
		).rejects.toThrow("Generated project root must be a real directory");
		expect(await readFile(join(productDirectory, ".cms-generated.json"), "utf8")).toBe(
			JSON.stringify(productManifest),
		);
		expect(await readFile(join(productDirectory, "keep.txt"), "utf8")).toBe("product-owned file");
	});

	it("leaves the current project intact if generation fails before replacement", async () => {
		await using directory = await mkdtempDisposable(join(tmpdir(), "cms-cli-generate-failure-"));
		const webSourceDirectory = join(directory.path, "incomplete-web-source");
		const paths = { ...resolveProjectPaths(directory.path), webSourceDirectory };
		const markerPath = join(paths.cmsDirectory, "existing-generated-project");

		await mkdir(paths.cmsDirectory, { recursive: true });
		await mkdir(webSourceDirectory, { recursive: true });
		await writeFile(markerPath, "existing");

		await expect(generateCmsProject(paths)).rejects.toThrow("Required CMS runtime file is missing");

		await access(markerPath);
		expect((await readdir(directory.path)).some((entry) => /^\.cms\.(tmp|old)-/.test(entry))).toBe(
			false,
		);
	});
});

async function createWebSource(directory: string): Promise<void> {
	for (const entry of ["components", "features", "lib", "middleware", "pages"]) {
		await mkdir(join(directory, entry), { recursive: true });
	}
	for (const file of ["cms-settings.ts", "styles.css", "vite-env.d.ts", "pages.gen.ts"]) {
		await writeFile(join(directory, file), "");
	}
	await writeFile(join(directory, "waku.server.ts"), "export default {};\n");
	await writeFile(join(directory, "../waku.config.ts"), "export default {};\n");
	await mkdir(join(directory, "..", "public"), { recursive: true });
}
