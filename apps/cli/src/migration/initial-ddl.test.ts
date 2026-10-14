import { createHash } from "node:crypto";
import { mkdtemp, mkdtempDisposable, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
	assertInitialMigrationArtifactsExist,
	assertInitialMigrationDirectoryIsEmpty,
	findCmsInitialMigrationArtifact,
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

	it("recognizes the generated cms-initial artifact and excludes only its state markers", async () => {
		await using directory = await mkdtempDisposable(join(tmpdir(), "cms-cli-drizzle-retry-"));
		const outputDirectory = join(directory.path, "drizzle");
		const migrationPath = join(outputDirectory, "0000_cms-initial.sql");
		const statePath = join(outputDirectory, "cms-state.json");
		const pendingPath = join(outputDirectory, ".cms-initial-pending.json");
		const migration = "CREATE TABLE item (id INTEGER PRIMARY KEY);\n";
		await mkdir(join(outputDirectory, "meta"), { recursive: true });
		await writeFile(migrationPath, migration);
		await writeFile(join(outputDirectory, "meta", "0000_snapshot.json"), "{}\n");
		await writeFile(
			join(outputDirectory, "meta", "_journal.json"),
			JSON.stringify({ entries: [{ idx: 0, tag: "0000_cms-initial" }] }),
		);
		await writeFile(statePath, "{}\n");
		await writeFile(pendingPath, "{}\n");

		expect(
			await findCmsInitialMigrationArtifact(outputDirectory, [statePath, pendingPath]),
		).toEqual({
			fileName: "0000_cms-initial.sql",
			path: migrationPath,
			sha256: createHash("sha256").update(migration).digest("hex"),
		});
	});

	it("refuses to resume when consumer-owned history contains another SQL file", async () => {
		await using directory = await mkdtempDisposable(join(tmpdir(), "cms-cli-drizzle-extra-"));
		const outputDirectory = join(directory.path, "drizzle");
		await mkdir(join(outputDirectory, "meta"), { recursive: true });
		await writeFile(
			join(outputDirectory, "0000_cms-initial.sql"),
			"CREATE TABLE item (id INTEGER);\n",
		);
		await writeFile(
			join(outputDirectory, "0001_custom.sql"),
			"CREATE TABLE custom (id INTEGER);\n",
		);
		await writeFile(join(outputDirectory, "meta", "0000_snapshot.json"), "{}\n");
		await writeFile(
			join(outputDirectory, "meta", "_journal.json"),
			JSON.stringify({ entries: [{ idx: 0, tag: "0000_cms-initial" }] }),
		);

		await expect(findCmsInitialMigrationArtifact(outputDirectory, [])).rejects.toThrow(
			"incomplete or contains other migration files",
		);
	});
});
