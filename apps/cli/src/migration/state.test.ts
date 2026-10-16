import { mkdtempDisposable, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { CmsDatabaseRelease } from "./database-changes.js";
import {
	compareCmsReleaseVersions,
	createCmsReleaseCatalog,
	resolveCmsSchemaRelease,
} from "./release-registry.js";
import {
	createEmptyCmsMigrationState,
	readCmsMigrationState,
	resolveVersionReference,
	validateVersionReference,
	writeCmsMigrationState,
} from "./state.js";

const initialSchemaHistory = [{ version: "0.0.0", fingerprint: `sha256:${"1".repeat(64)}` }];

describe("CMS migration state", () => {
	it("keeps missing baseline and prepared records unknown until the consumer records them", async () => {
		await using directory = await mkdtempDisposable(join(tmpdir(), "cms-cli-migration-state-"));
		const statePath = join(directory.path, "drizzle", "cms-state.json");

		expect(await readCmsMigrationState(statePath)).toEqual(createEmptyCmsMigrationState());
		const state = createEmptyCmsMigrationState();
		state.baseline = { version: "0.0.0", schemaId: "core-schema-v1" };
		await writeCmsMigrationState(statePath, state);

		expect(JSON.parse(await readFile(statePath, "utf8"))).toEqual(state);
		expect(await readCmsMigrationState(statePath)).toEqual(state);
	});

	it("resolves an explicit CMS version to its registered schema", () => {
		const catalog = createCmsReleaseCatalog("0.0.0");

		expect(resolveVersionReference("0.0.0", catalog)).toEqual({
			version: "0.0.0",
			schemaId: "core-schema-v1",
		});
		expect(
			validateVersionReference(
				{ version: "0.0.0", schemaId: "core-schema-v1" },
				catalog,
				"baseline",
			),
		).toEqual({ version: "0.0.0", schemaId: "core-schema-v1" });
		expect(() =>
			validateVersionReference({ version: "0.0.0", schemaId: "wrong" }, catalog, "baseline"),
		).toThrow("does not match CMS 0.0.0");
		expect(() => resolveCmsSchemaRelease("0.2.0", catalog)).toThrow(
			"newer than the installed version",
		);
		expect(() => resolveCmsSchemaRelease("invalid", catalog)).toThrow("Invalid CMS version");
		expect(() => resolveCmsSchemaRelease("0.0.0-beta.1", catalog)).toThrow(
			"not present in the installed package release history",
		);
	});

	it("keeps prerelease package versions aligned with the initial schema history", () => {
		const developmentCatalog = createCmsReleaseCatalog("0.0.0");
		const alphaCatalog = createCmsReleaseCatalog("0.1.0-alpha.0");

		expect(developmentCatalog.current.version).toBe("0.0.0");
		expect(developmentCatalog.releases).toHaveLength(1);
		expect(alphaCatalog.current.version).toBe("0.1.0-alpha.0");
		expect(alphaCatalog.releases).toHaveLength(2);
	});

	it("orders prereleases and stable releases according to SemVer", () => {
		const packageVersions = ["0.0.0", "0.1.0-alpha.2", "0.1.0-alpha.10", "0.1.0-beta.1", "0.1.0"];
		const catalog = createCmsReleaseCatalog("0.1.0", {
			packageVersions,
			schemaHistory: initialSchemaHistory,
		});

		expect(resolveCmsSchemaRelease("0.1.0-alpha.2", catalog).version).toBe("0.1.0-alpha.2");
		expect(resolveCmsSchemaRelease("0.1.0-beta.1", catalog).version).toBe("0.1.0-beta.1");
		expect(compareCmsReleaseVersions("0.1.0-alpha.2", "0.1.0-alpha.10", catalog)).toBeLessThan(0);
		expect(compareCmsReleaseVersions("0.1.0-alpha.10", "0.1.0-beta.1", catalog)).toBeLessThan(0);
		expect(compareCmsReleaseVersions("0.1.0-beta.1", "0.1.0", catalog)).toBeLessThan(0);
		expect(() => resolveCmsSchemaRelease("0.1.0-rc.1", catalog)).toThrow(
			"not present in the installed package release history",
		);
	});

	it("allows a data-only release to keep the same schema identifier", () => {
		const databaseReleases: CmsDatabaseRelease[] = [
			{
				version: "0.1.1",
				changes: [{ kind: "data", summary: "Normalize old values", details: ["Preserve IDs."] }],
			},
		];
		const catalog = createCmsReleaseCatalog("0.1.1", {
			packageVersions: ["0.0.0", "0.1.0", "0.1.1"],
			databaseReleases,
			schemaHistory: initialSchemaHistory,
		});

		expect(resolveVersionReference("0.1.0", catalog)).toEqual({
			version: "0.1.0",
			schemaId: "core-schema-v1",
		});
		expect(catalog.current.schemaId).toBe("core-schema-v1");
		expect(catalog.current.changes[0]?.kind).toBe("data");
	});

	it("rejects malformed persisted state instead of replacing it with the current schema", async () => {
		await using directory = await mkdtempDisposable(
			join(tmpdir(), "cms-cli-migration-state-invalid-"),
		);
		const statePath = join(directory.path, "cms-state.json");

		await writeFile(statePath, '{"formatVersion":2,"baseline":null,"preparedThrough":null}\n');

		await expect(readCmsMigrationState(statePath)).rejects.toThrow("unsupported format");
	});
});
