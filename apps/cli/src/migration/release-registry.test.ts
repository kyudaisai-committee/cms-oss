import { describe, expect, it } from "vitest";

import type { CmsDatabaseRelease } from "./database-changes.js";
import { cmsPackageVersions } from "./release-metadata.generated.js";
import {
	createCmsReleaseCatalog,
	cmsDatabaseReleases,
	resolveCmsSchemaRelease,
} from "./release-registry.js";

const initialSchemaHistory = [{ version: "0.0.0", fingerprint: `sha256:${"1".repeat(64)}` }];

describe("CMS database release history", () => {
	it("keeps package releases without database changes out of the database event list", () => {
		const catalog = createCmsReleaseCatalog("0.1.0-alpha.1");

		expect(cmsDatabaseReleases).toEqual([]);
		expect(cmsPackageVersions).toContain("0.1.0-alpha.1");
		expect(catalog.releases.map((release) => release.version)).toContain("0.1.0-alpha.0");
		expect(catalog.current).toMatchObject({
			version: "0.1.0-alpha.1",
			schemaId: "core-schema-v1",
			schemaExport: "@kyudaisai/cms/db/schema",
			changes: [],
		});
	});

	it("accepts an additional known package version without a database event", () => {
		const catalog = createCmsReleaseCatalog("0.1.0-alpha.2", {
			packageVersions: ["0.0.0", "0.1.0-alpha.0", "0.1.0-alpha.1", "0.1.0-alpha.2"],
			schemaHistory: initialSchemaHistory,
		});

		expect(catalog.current).toMatchObject({ version: "0.1.0-alpha.2", changes: [] });
		expect(catalog.current.schemaId).toBe("core-schema-v1");
	});

	it("resolves schema identity and ordered changes from explicit database events", () => {
		const databaseReleases: CmsDatabaseRelease[] = [
			{
				version: "0.1.1",
				changes: [{ kind: "data", summary: "Normalize old values", details: ["Preserve IDs."] }],
			},
			{
				version: "0.2.0",
				changes: [
					{ kind: "schema", summary: "Add a field", details: ["Existing rows remain valid."] },
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

		expect(resolveCmsSchemaRelease("0.1.0", catalog).schemaId).toBe("core-schema-v1");
		expect(resolveCmsSchemaRelease("0.1.1", catalog).changes[0]?.kind).toBe("data");
		expect(catalog.current.schemaId).toBe(`sha256:${"2".repeat(64)}`);
		expect(catalog.current.changes[0]?.kind).toBe("schema");
	});

	it("rejects unregistered package versions and future references", () => {
		const catalog = createCmsReleaseCatalog("0.1.0-alpha.1");

		expect(() => createCmsReleaseCatalog("0.1.0-alpha.2")).toThrow(
			"missing from the package release history",
		);
		expect(() => resolveCmsSchemaRelease("0.2.0", catalog)).toThrow(
			"newer than the installed version",
		);
		expect(() => resolveCmsSchemaRelease("0.0.9", catalog)).toThrow(
			"not present in the installed package release history",
		);
	});

	it("requires schema event snapshots and known, ordered database event versions", () => {
		const schemaChange: CmsDatabaseRelease[] = [
			{
				version: "0.2.0",
				changes: [{ kind: "schema", summary: "Add a field", details: ["Preserve rows."] }],
			},
		];
		const packageVersions = ["0.0.0", "0.1.0", "0.2.0"];

		expect(() =>
			createCmsReleaseCatalog("0.2.0", {
				packageVersions,
				databaseReleases: schemaChange,
				schemaHistory: initialSchemaHistory,
			}),
		).toThrow("must record changes and a schema snapshot exactly when its changes include schema");
		expect(() =>
			createCmsReleaseCatalog("0.2.0", {
				packageVersions,
				databaseReleases: [
					{
						version: "0.2.1",
						changes: [{ kind: "data", summary: "Fix data", details: ["Keep IDs."] }],
					},
				],
				schemaHistory: initialSchemaHistory,
			}),
		).toThrow("unknown version");
	});
});
