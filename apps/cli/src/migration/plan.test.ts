import { describe, expect, it } from "vitest";

import { createCmsMigrationPlan, formatCmsMigrationPlan } from "./plan.js";
import { createCmsReleaseCatalog, type CmsSchemaRelease } from "./release-registry.js";
import { createEmptyCmsMigrationState } from "./state.js";

describe("CMS migration plan", () => {
	it("reports an unknown baseline without treating the current schema as applied", () => {
		const plan = createCmsMigrationPlan(
			createEmptyCmsMigrationState(),
			createCmsReleaseCatalog("0.0.0"),
		);

		expect(plan).toEqual({ kind: "baseline-unknown", currentVersion: "0.0.0" });
		expect(formatCmsMigrationPlan(plan)).toContain("is not assumed to be applied");
		expect(formatCmsMigrationPlan(plan)).toContain("cms migrate mark-baseline --version");
	});

	it("lists schema and data changes after the last prepared version", () => {
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
				changes: [{ kind: "data", summary: "Normalize slugs", details: ["Keep existing IDs."] }],
			},
			{
				version: "0.2.0",
				schemaId: "core-schema-v2",
				schemaExport: "@repo/cli/db/schema",
				changes: [
					{
						kind: "schema",
						summary: "Add publication state",
						details: ["Existing rows default to draft."],
					},
				],
			},
		];
		const state = createEmptyCmsMigrationState();
		state.baseline = { version: "0.1.0", schemaId: "core-schema-v1" };
		state.preparedThrough = { version: "0.1.1", schemaId: "core-schema-v1" };
		const plan = createCmsMigrationPlan(state, createCmsReleaseCatalog("0.2.0", releases));

		expect(plan.kind).toBe("changes");
		if (plan.kind !== "changes") throw new Error("Expected a migration change plan.");
		expect(plan.from.version).toBe("0.1.1");
		expect(plan.changes.map(({ version, change }) => [version, change.kind])).toEqual([
			["0.2.0", "schema"],
		]);
		expect(formatCmsMigrationPlan(plan)).toContain("cms migrate mark-prepared --version 0.2.0");
	});

	it("refuses to interpret a baseline or prepared state outside the installed schema history", () => {
		const state = createEmptyCmsMigrationState();
		state.baseline = { version: "0.0.9", schemaId: "unknown" };
		const plan = createCmsMigrationPlan(state, createCmsReleaseCatalog("0.1.0-alpha.0"));

		expect(plan.kind).toBe("baseline-unknown");
		if (plan.kind !== "baseline-unknown") throw new Error("Expected an unknown baseline.");
		expect(plan.reason).toContain("not present in the installed schema history");
	});

	it("shows no database changes when the current schema is the recorded baseline", () => {
		const state = createEmptyCmsMigrationState();
		state.baseline = { version: "0.0.0", schemaId: "core-schema-v1" };
		const plan = createCmsMigrationPlan(state, createCmsReleaseCatalog("0.0.0"));

		expect(formatCmsMigrationPlan(plan)).toBe("No database changes from CMS 0.0.0 to 0.0.0.");
	});

	it("rejects a schema identity change without a recorded database change", () => {
		const releases: CmsSchemaRelease[] = [
			{
				version: "0.1.0",
				schemaId: "schema-v1",
				schemaExport: "@repo/cli/db/schema",
				changes: [],
			},
			{
				version: "0.2.0",
				schemaId: "schema-v2",
				schemaExport: "@repo/cli/db/schema",
				changes: [],
			},
		];

		expect(() => createCmsReleaseCatalog("0.2.0", releases)).toThrow(
			"changes schema identity without recording a database change",
		);
	});

	it("allows a version-only release when the schema identity is unchanged", () => {
		const releases: CmsSchemaRelease[] = [
			{
				version: "0.1.0",
				schemaId: "schema-v1",
				schemaExport: "@repo/cli/db/schema",
				changes: [],
			},
			{
				version: "0.2.0",
				schemaId: "schema-v1",
				schemaExport: "@repo/cli/db/schema",
				changes: [],
			},
		];
		const state = createEmptyCmsMigrationState();
		state.baseline = { version: "0.1.0", schemaId: "schema-v1" };
		const plan = createCmsMigrationPlan(state, createCmsReleaseCatalog("0.2.0", releases));

		expect(plan).toEqual({ kind: "no-changes", fromVersion: "0.1.0", toVersion: "0.2.0" });
	});
});
