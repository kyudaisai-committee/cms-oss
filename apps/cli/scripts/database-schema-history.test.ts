import { describe, expect, it } from "vitest";

import { bindPendingCmsReleaseHistory } from "../src/migration/release-history.js";
import {
	assertCurrentCmsSchemaMatchesHistory,
	fingerprintCmsSchemaSnapshot,
	validateCmsDatabaseHistory,
	type ProductSchemaSnapshot,
} from "./database-schema-history.js";

const baselineSnapshot: ProductSchemaSnapshot = {
	version: "0.0.0",
	snapshot: {
		id: "transient-id",
		prevId: "transient-parent",
		tables: { news: { columns: { id: { type: "text" } } } },
	},
};

describe("CMS schema release history", () => {
	it("keeps Drizzle snapshot fingerprints stable across transient IDs and key order", () => {
		expect(
			fingerprintCmsSchemaSnapshot({
				tables: { news: { columns: { id: { type: "text" } } } },
				prevId: "another-parent",
				id: "another-id",
			}),
		).toBe(fingerprintCmsSchemaSnapshot(baselineSnapshot.snapshot));
	});

	it("accepts package and data-only releases without adding schema snapshots", () => {
		expect(() =>
			validateCmsDatabaseHistory(
				["0.0.0", "0.1.0", "0.1.1"],
				[
					{
						version: "0.1.1",
						changes: [
							{ kind: "data", summary: "Normalize old values", details: ["Preserve IDs."] },
						],
					},
				],
				[baselineSnapshot],
			),
		).not.toThrow();
	});

	it("binds a pending schema event and changed snapshot only to a newly released known version", () => {
		const packageVersions = ["0.0.0", "0.1.0", "0.2.0"];
		const databaseReleases = [
			{
				version: "pending",
				changes: [
					{ kind: "schema" as const, summary: "Add title", details: ["Keep existing rows."] },
				],
			},
		];
		const schemaHistory = [
			{
				version: "0.0.0",
				fingerprint: fingerprintCmsSchemaSnapshot(baselineSnapshot.snapshot),
			},
			{
				version: "pending",
				fingerprint: fingerprintCmsSchemaSnapshot({ tables: { news: { columns: { title: {} } } } }),
			},
		];

		const resolved = bindPendingCmsReleaseHistory(
			packageVersions,
			["0.0.0", "0.1.0"],
			"0.2.0",
			databaseReleases,
			schemaHistory,
		);

		expect(resolved.databaseReleases[0]?.version).toBe("0.2.0");
		expect(resolved.schemaHistory[1]?.version).toBe("0.2.0");
		expect(() =>
			bindPendingCmsReleaseHistory(
				["0.0.0", "0.1.0"],
				["0.0.0", "0.1.0"],
				"0.1.0",
				databaseReleases,
				schemaHistory,
			),
		).toThrow("only be bound after Changesets creates a new known package version");
	});

	it("binds pending data-only events without changing the schema baseline", () => {
		const resolved = bindPendingCmsReleaseHistory(
			["0.0.0", "0.1.0", "0.2.0"],
			["0.0.0", "0.1.0"],
			"0.2.0",
			[
				{
					version: "pending",
					changes: [{ kind: "data", summary: "Normalize values", details: ["Preserve IDs."] }],
				},
			],
			[
				{
					version: "0.0.0",
					fingerprint: fingerprintCmsSchemaSnapshot(baselineSnapshot.snapshot),
				},
			],
		);

		expect(resolved.databaseReleases[0]?.version).toBe("0.2.0");
		expect(resolved.schemaHistory).toHaveLength(1);
	});

	it("requires a schema event and a changed snapshot for every schema history entry", () => {
		const packageVersions = ["0.0.0", "0.1.0"];
		const nextSnapshot: ProductSchemaSnapshot = {
			version: "0.1.0",
			snapshot: {
				tables: { news: { columns: { id: { type: "text" }, title: { type: "text" } } } },
			},
		};

		expect(() =>
			validateCmsDatabaseHistory(
				packageVersions,
				[
					{
						version: "0.1.0",
						changes: [{ kind: "data", summary: "Fix data", details: ["Preserve IDs."] }],
					},
				],
				[baselineSnapshot, nextSnapshot],
			),
		).toThrow("has no matching schema change event");

		expect(() =>
			validateCmsDatabaseHistory(
				packageVersions,
				[
					{
						version: "0.1.0",
						changes: [{ kind: "schema", summary: "Add title", details: ["Keep existing rows."] }],
					},
				],
				[baselineSnapshot],
			),
		).toThrow("must record changes and a schema snapshot exactly when its changes include schema");

		expect(() =>
			validateCmsDatabaseHistory(
				["0.0.0", "0.1.0"],
				[
					{
						version: "0.1.0",
						changes: [{ kind: "schema", summary: "Add title", details: ["Keep existing rows."] }],
					},
				],
				[
					baselineSnapshot,
					{
						version: "0.1.0",
						snapshot: { ...baselineSnapshot.snapshot },
					},
				],
			),
		).toThrow("does not change the schema snapshot");
	});

	it("rejects database events for package versions absent from the changelog history", () => {
		expect(() =>
			validateCmsDatabaseHistory(
				["0.0.0", "0.1.0"],
				[
					{
						version: "0.2.0",
						changes: [{ kind: "data", summary: "Fix data", details: ["Preserve IDs."] }],
					},
				],
				[baselineSnapshot],
			),
		).toThrow("unknown version");
	});

	it("fails the pack gate when the Drizzle schema differs from the recorded snapshot", () => {
		const fingerprint = fingerprintCmsSchemaSnapshot(baselineSnapshot.snapshot);

		expect(() =>
			assertCurrentCmsSchemaMatchesHistory("0.1.0", "0.1.0", fingerprint, [baselineSnapshot]),
		).not.toThrow();
		expect(() =>
			assertCurrentCmsSchemaMatchesHistory("0.0.0", "0.2.0", fingerprint, [baselineSnapshot]),
		).not.toThrow();
		expect(() =>
			assertCurrentCmsSchemaMatchesHistory("0.1.0", "0.1.0", "sha256:changed", [baselineSnapshot]),
		).toThrow("before packing or releasing");
		expect(() =>
			assertCurrentCmsSchemaMatchesHistory("0.1.0", "0.2.0", fingerprint, [
				baselineSnapshot,
				{
					version: "0.2.0",
					snapshot: { tables: { news: { columns: { title: { type: "text" } } } } },
				},
			]),
		).toThrow("not the latest known package release");
	});
});
