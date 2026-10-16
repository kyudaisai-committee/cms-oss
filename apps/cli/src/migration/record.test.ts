import { describe, expect, it } from "vitest";

import { recordCmsBaseline, recordCmsPreparedThrough } from "./record.js";
import { createCmsReleaseCatalog, type CmsSchemaRelease } from "./release-registry.js";
import { createEmptyCmsMigrationState } from "./state.js";

const dataReleaseCatalog = createCmsReleaseCatalog("0.1.2", [
	{
		version: "0.1.0",
		schemaId: "core-schema-v1",
		schemaExport: "@kyudaisai/cms/db/schema",
		changes: [],
	},
	{
		version: "0.1.1",
		schemaId: "core-schema-v1",
		schemaExport: "@kyudaisai/cms/db/schema",
		changes: [{ kind: "data", summary: "Normalize slugs", details: ["Keep IDs."] }],
	},
	{
		version: "0.1.2",
		schemaId: "core-schema-v1",
		schemaExport: "@kyudaisai/cms/db/schema",
		changes: [],
	},
] satisfies CmsSchemaRelease[]);

describe("explicit CMS migration state recording", () => {
	it("requires a known, non-future version and records its matching schema ID", () => {
		const state = recordCmsBaseline(createEmptyCmsMigrationState(), "0.1.1", dataReleaseCatalog);

		expect(state.baseline).toEqual({ version: "0.1.1", schemaId: "core-schema-v1" });
		expect(() =>
			recordCmsBaseline(createEmptyCmsMigrationState(), "0.2.0", dataReleaseCatalog),
		).toThrow("newer than the installed version");
		expect(() =>
			recordCmsBaseline(createEmptyCmsMigrationState(), "0.1.0-beta.1", dataReleaseCatalog),
		).toThrow("not present in the installed schema history");
		expect(() =>
			recordCmsBaseline(createEmptyCmsMigrationState(), "0.1.0-beta.", dataReleaseCatalog),
		).toThrow("Invalid CMS version");
		expect(() =>
			recordCmsBaseline(createEmptyCmsMigrationState(), "0.0.9", dataReleaseCatalog),
		).toThrow("not present in the installed schema history");
	});

	it("rejects a baseline reversal and advancement beyond prepared migrations", () => {
		const state = createEmptyCmsMigrationState();
		state.baseline = { version: "0.1.1", schemaId: "core-schema-v1" };
		state.preparedThrough = { version: "0.1.1", schemaId: "core-schema-v1" };

		expect(() => recordCmsBaseline(state, "0.1.0", dataReleaseCatalog)).toThrow(
			"cannot move backwards",
		);
		expect(() => recordCmsBaseline(state, "0.1.2", dataReleaseCatalog)).toThrow(
			"Prepare migration files through this version",
		);
	});

	it("requires a baseline before recording prepared migrations and rejects regressions", () => {
		const emptyState = createEmptyCmsMigrationState();
		expect(() => recordCmsPreparedThrough(emptyState, "0.1.0", dataReleaseCatalog)).toThrow(
			"verified baseline is required",
		);

		const state = recordCmsBaseline(emptyState, "0.1.0", dataReleaseCatalog);
		const prepared = recordCmsPreparedThrough(state, "0.1.2", dataReleaseCatalog);
		expect(prepared.preparedThrough).toEqual({ version: "0.1.2", schemaId: "core-schema-v1" });
		expect(() => recordCmsPreparedThrough(prepared, "0.1.1", dataReleaseCatalog)).toThrow(
			"cannot move backwards",
		);
		expect(() => recordCmsPreparedThrough(state, "0.0.9", dataReleaseCatalog)).toThrow(
			"not present in the installed schema history",
		);
	});

	it("keeps database application outside the migration preparation state", () => {
		const state = recordCmsPreparedThrough(
			recordCmsBaseline(createEmptyCmsMigrationState(), "0.1.0", dataReleaseCatalog),
			"0.1.1",
			dataReleaseCatalog,
		);

		expect(state).toEqual({
			formatVersion: 1,
			baseline: { version: "0.1.0", schemaId: "core-schema-v1" },
			preparedThrough: { version: "0.1.1", schemaId: "core-schema-v1" },
		});
	});
});
