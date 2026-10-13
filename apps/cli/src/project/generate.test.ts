import {
	access,
	mkdir,
	mkdtemp,
	readFile,
	readlink,
	readdir,
	rm,
	stat,
	utimes,
	writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ensureStarterFiles, generateCmsProject } from "./generate.js";
import { resolveProjectPaths } from "./paths.js";

describe("generated consumer project", () => {
	it("keeps consumer config, migrations, and Wrangler state outside regenerated .cms", async () => {
		const directory = await mkdtemp(join(tmpdir(), "cms-cli-generate-"));
		const webSourceDirectory = join(directory, "web-source");
		const paths = { ...resolveProjectPaths(directory), webSourceDirectory };

		try {
			await createWebSource(webSourceDirectory);
			await ensureStarterFiles(paths);
			const consumerConfig = 'export default { name: "Consumer-owned" };\n';
			const drizzleConfig = 'export default { out: "./migrations" };\n';
			await writeFile(paths.configPath, consumerConfig);
			await writeFile(paths.drizzleConfigPath, drizzleConfig);
			const d1State = join(paths.wranglerStateDirectory, "v3", "state.sqlite");
			await mkdir(join(paths.wranglerStateDirectory, "v3"), { recursive: true });
			await writeFile(d1State, "consumer database state");

			await generateCmsProject(paths);
			const generatedConfigPath = join(paths.cmsDirectory, "waku.config.ts");
			const generatedConfig = await readFile(generatedConfigPath, "utf8");
			const generatedRequire = createRequire(join(paths.cmsDirectory, "package.json"));
			const productRequire = createRequire(join(paths.packageRoot, "package.json"));
			expect(generatedConfig).toContain('from "../cms.config.ts"');
			expect(generatedConfig).toContain('from "@repo/cli/web/waku.config.ts"');
			expect(generatedRequire.resolve("@repo/core/db/schema")).toBe(
				productRequire.resolve("@repo/core/db/schema"),
			);
			expect(await readlink(join(paths.cmsDirectory, "node_modules", "@repo", "cli"))).toBe(
				paths.packageRoot,
			);
			expect(await readlink(join(paths.cmsDirectory, "node_modules", ".bin"))).toBe(
				join(paths.packageRoot, "node_modules", ".bin"),
			);
			expect(await readlink(join(paths.cmsDirectory, "src", "pages"))).toBe(
				join(webSourceDirectory, "pages"),
			);

			const stableModificationTime = new Date("2000-01-01T00:00:00.000Z");
			await utimes(generatedConfigPath, stableModificationTime, stableModificationTime);
			await generateCmsProject(paths);
			expect(await readFile(generatedConfigPath, "utf8")).toBe(generatedConfig);
			expect((await stat(generatedConfigPath)).mtimeMs).toBe(stableModificationTime.getTime());
			expect(await readFile(paths.configPath, "utf8")).toBe(consumerConfig);
			expect(await readFile(paths.drizzleConfigPath, "utf8")).toBe(drizzleConfig);
			expect(await readFile(d1State, "utf8")).toBe("consumer database state");
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("leaves the current project intact if generation fails before replacement", async () => {
		const directory = await mkdtemp(join(tmpdir(), "cms-cli-generate-failure-"));
		const webSourceDirectory = join(directory, "incomplete-web-source");
		const paths = { ...resolveProjectPaths(directory), webSourceDirectory };
		const markerPath = join(paths.cmsDirectory, "existing-generated-project");

		try {
			await mkdir(paths.cmsDirectory, { recursive: true });
			await mkdir(webSourceDirectory, { recursive: true });
			await writeFile(markerPath, "existing");

			await expect(generateCmsProject(paths)).rejects.toThrow(
				"Required CMS runtime file is missing",
			);

			await access(markerPath);
			expect((await readdir(directory)).some((entry) => /^\.cms\.(tmp|old)-/.test(entry))).toBe(
				false,
			);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});

async function createWebSource(directory: string): Promise<void> {
	for (const entry of ["components", "features", "lib", "middleware", "pages"]) {
		await mkdir(join(directory, entry), { recursive: true });
	}
	for (const file of ["cms-settings.ts", "styles.css", "vite-env.d.ts"]) {
		await writeFile(join(directory, file), "");
	}
	await mkdir(join(directory, "..", "public"), { recursive: true });
}
