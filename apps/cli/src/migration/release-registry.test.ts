import { describe, expect, it } from "vitest";

import {
	createCmsReleaseCatalog,
	cmsSchemaReleases,
	resolveCmsSchemaRelease,
} from "./release-registry.js";

describe("CMS schema release registry", () => {
	it("records a public package path change without a database migration", () => {
		const previous = cmsSchemaReleases.find((release) => release.version === "0.1.0-alpha.0");
		const catalog = createCmsReleaseCatalog("0.1.0-alpha.1");
		const current = catalog.current;

		expect(previous).toBeDefined();
		expect(current).toMatchObject({
			schemaId: "core-schema-v1",
			schemaExport: "@kyudaisai/cms/db/schema",
			changes: [],
		});
		expect(current.schemaId).toBe(previous?.schemaId);
		expect(resolveCmsSchemaRelease("0.1.0-alpha.0", catalog).schemaId).toBe(current.schemaId);
	});

	it("accepts only the exported public database schema subpath", () => {
		expect(() =>
			createCmsReleaseCatalog("1.0.0", [
				{
					version: "1.0.0",
					schemaId: "core-schema-v1",
					schemaExport: "@kyudaisai/cms/db/schema/arbitrary",
					changes: [],
				},
			]),
		).toThrow("invalid schema reference");
	});
});
