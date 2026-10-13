import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
	assertInitialMigrationArtifactsExist,
	assertInitialMigrationDirectoryIsEmpty,
	resolveDrizzleOutputDirectory,
} from "./initial-ddl.js";

describe("initial Drizzle migration generation", () => {
	it("uses the output directory from the consumer-owned Drizzle config", async () => {
		const directory = await mkdtemp(join(tmpdir(), "cms-cli-drizzle-out-"));
		const configPath = join(directory, "drizzle.config.ts");

		try {
			await writeFile(configPath, 'export default { out: "./migrations/current" };\n');
			expect(await resolveDrizzleOutputDirectory(configPath)).toBe(
				join(directory, "migrations", "current"),
			);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("refuses to initialize when consumer migration files or state already exist", async () => {
		const directory = await mkdtemp(join(tmpdir(), "cms-cli-drizzle-existing-"));
		const outputDirectory = join(directory, "drizzle");
		const statePath = join(outputDirectory, "cms-state.json");
		const migrationPath = join(outputDirectory, "0000_existing.sql");

		try {
			await mkdir(outputDirectory, { recursive: true });
			await writeFile(migrationPath, "CREATE TABLE existing (id INTEGER);\n");
			await expect(
				assertInitialMigrationDirectoryIsEmpty(outputDirectory, statePath),
			).rejects.toThrow("Refusing to initialize CMS migrations");
			expect(await readFile(migrationPath, "utf8")).toContain("CREATE TABLE existing");
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("requires Drizzle Kit to produce SQL, a snapshot, and a journal", async () => {
		const directory = await mkdtemp(join(tmpdir(), "cms-cli-drizzle-artifacts-"));
		const outputDirectory = join(directory, "drizzle");

		try {
			await mkdir(join(outputDirectory, "meta"), { recursive: true });
			await writeFile(
				join(outputDirectory, "0000_initial.sql"),
				"CREATE TABLE item (id INTEGER);\n",
			);
			await writeFile(join(outputDirectory, "meta", "0000_snapshot.json"), "{}\n");
			await writeFile(join(outputDirectory, "meta", "_journal.json"), "{}\n");

			await expect(assertInitialMigrationArtifactsExist(outputDirectory)).resolves.toBeUndefined();
			await rm(join(outputDirectory, "0000_initial.sql"));
			await expect(assertInitialMigrationArtifactsExist(outputDirectory)).rejects.toThrow(
				"expected SQL, snapshot, and journal",
			);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
