import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
	createCmsReleaseCatalog,
	resolveCmsSchemaRelease,
	type CmsSchemaRelease,
} from "./release-registry.js";
import {
	createEmptyCmsMigrationState,
	readCmsMigrationState,
	resolveVersionReference,
	validateVersionReference,
	writeCmsMigrationState,
} from "./state.js";

describe("CMS migration state", () => {
	it("keeps missing baseline and prepared records unknown until the consumer records them", async () => {
		const directory = await mkdtemp(join(tmpdir(), "cms-cli-migration-state-"));
		const statePath = join(directory, "drizzle", "cms-state.json");

		try {
			expect(await readCmsMigrationState(statePath)).toEqual(createEmptyCmsMigrationState());
			const state = createEmptyCmsMigrationState();
			state.baseline = { version: "0.1.0", schemaId: "core-schema-v1" };
			await writeCmsMigrationState(statePath, state);

			expect(JSON.parse(await readFile(statePath, "utf8"))).toEqual(state);
			expect(await readCmsMigrationState(statePath)).toEqual(state);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("resolves an explicit CMS version to its registered schema", () => {
		const catalog = createCmsReleaseCatalog("0.1.0");

		expect(resolveVersionReference("0.1.0", catalog)).toEqual({
			version: "0.1.0",
			schemaId: "core-schema-v1",
		});
		expect(
			validateVersionReference(
				{ version: "0.1.0", schemaId: "core-schema-v1" },
				catalog,
				"baseline",
			),
		).toEqual({ version: "0.1.0", schemaId: "core-schema-v1" });
		expect(() =>
			validateVersionReference({ version: "0.1.0", schemaId: "wrong" }, catalog, "baseline"),
		).toThrow("does not match CMS 0.1.0");
		expect(() => resolveCmsSchemaRelease("0.2.0", catalog)).toThrow(
			"newer than the installed version",
		);
		expect(() => resolveCmsSchemaRelease("invalid", catalog)).toThrow("Invalid CMS version");
		expect(() => resolveCmsSchemaRelease("0.0.9", catalog)).toThrow(
			"not present in the installed schema history",
		);
	});

	it("allows a data-only release to keep the same schema identifier", () => {
		const releases: CmsSchemaRelease[] = [
			{
				version: "0.1.0",
				schemaId: "core-schema-v1",
				schemaExport: "@repo/cli/db/schema",
				changes: [],
			},
			{
				version: "0.1.1",
				schemaId: "core-schema-v1",
				schemaExport: "@repo/cli/db/schema",
				changes: [{ kind: "data", summary: "Normalize old values", details: ["Preserve IDs."] }],
			},
		];
		const catalog = createCmsReleaseCatalog("0.1.1", releases);

		expect(resolveVersionReference("0.1.0", catalog)).toEqual({
			version: "0.1.0",
			schemaId: "core-schema-v1",
		});
		expect(catalog.current.schemaId).toBe("core-schema-v1");
		expect(catalog.current.changes[0]?.kind).toBe("data");
	});

	it("rejects malformed persisted state instead of replacing it with the current schema", async () => {
		const directory = await mkdtemp(join(tmpdir(), "cms-cli-migration-state-invalid-"));
		const statePath = join(directory, "cms-state.json");

		try {
			await writeFile(statePath, '{"formatVersion":2,"baseline":null,"preparedThrough":null}\n');

			await expect(readCmsMigrationState(statePath)).rejects.toThrow("unsupported format");
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
