import { describe, expect, it } from "vitest";

import type { CmsDatabaseRelease } from "./database-changes.js";
import { createCmsMigrationPlan, formatCmsMigrationPlan } from "./plan.js";
import { createCmsReleaseCatalog } from "./release-registry.js";
import { createEmptyCmsMigrationState } from "./state.js";

const initialSchemaHistory = [{ version: "0.0.0", fingerprint: `sha256:${"1".repeat(64)}` }];

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
		const databaseReleases: CmsDatabaseRelease[] = [
			{
				version: "0.1.1",
				changes: [{ kind: "data", summary: "Normalize slugs", details: ["Keep existing IDs."] }],
			},
			{
				version: "0.2.0",
				changes: [
					{
						kind: "schema",
						summary: "Add publication state",
						details: ["Existing rows default to draft."],
					},
				],
			},
		];
		const catalog = createCmsReleaseCatalog("0.2.0", {
			packageVersions: ["0.0.0", "0.1.0", "0.1.1", "0.2.0"],
			databaseReleases,
			schemaHistory: [
				...initialSchemaHistory,
				{ version: "0.2.0", fingerprint: `sha256:${"2".repeat(64)}` },
			],
		});
		const state = createEmptyCmsMigrationState();
		state.baseline = { version: "0.1.0", schemaId: "core-schema-v1" };
		state.preparedThrough = { version: "0.1.1", schemaId: "core-schema-v1" };
		const plan = createCmsMigrationPlan(state, catalog);

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
		expect(plan.reason).toContain("not present in the installed package release history");
	});

	it("shows no database changes when the current schema is the recorded baseline", () => {
		const state = createEmptyCmsMigrationState();
		state.baseline = { version: "0.0.0", schemaId: "core-schema-v1" };
		const plan = createCmsMigrationPlan(state, createCmsReleaseCatalog("0.0.0"));

		expect(formatCmsMigrationPlan(plan)).toBe("No database changes from CMS 0.0.0 to 0.0.0.");
	});

	it("rejects a schema identity change without a recorded database change", () => {
		const databaseReleases: CmsDatabaseRelease[] = [
			{
				version: "0.2.0",
				changes: [{ kind: "schema", summary: "Change the schema", details: ["Preserve rows."] }],
			},
		];

		expect(() =>
			createCmsReleaseCatalog("0.2.0", {
				packageVersions: ["0.0.0", "0.1.0", "0.2.0"],
				databaseReleases,
				schemaHistory: initialSchemaHistory,
			}),
		).toThrow(/schema snapshot/);
	});

	it("allows a version-only release when the schema identity is unchanged", () => {
		const state = createEmptyCmsMigrationState();
		state.baseline = { version: "0.1.0", schemaId: "core-schema-v1" };
		const plan = createCmsMigrationPlan(
			state,
			createCmsReleaseCatalog("0.2.0", {
				packageVersions: ["0.0.0", "0.1.0", "0.2.0"],
				databaseReleases: [],
				schemaHistory: initialSchemaHistory,
			}),
		);

		expect(plan).toEqual({ kind: "no-changes", fromVersion: "0.1.0", toVersion: "0.2.0" });
	});
});
