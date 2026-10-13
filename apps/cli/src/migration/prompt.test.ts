import { describe, expect, it } from "vitest";

import { createCmsMigrationPrompt } from "./prompt.js";

describe("CMS migration prompt", () => {
	it("passes the release range, registered changes, consumer paths, and no-apply contract", () => {
		const prompt = createCmsMigrationPrompt({
			plan: {
				kind: "changes",
				from: { version: "0.1.0", schemaId: "core-schema-v1" },
				to: { version: "0.2.0", schemaId: "core-schema-v2" },
				changes: [
					{
						version: "0.2.0",
						change: {
							kind: "data",
							summary: "Normalize stored language tags",
							details: ["Convert legacy `jp` values to `ja` before adding the new constraint."],
						},
					},
				],
			},
			schemaExport: "@repo/cli/db/schema",
			configPath: "/consumer/cms.config.ts",
			drizzleConfigPath: "/consumer/drizzle.config.ts",
			migrationsDirectory: "/consumer/drizzle",
		});

		expect(prompt).toContain("CMS 0.1.0 (core-schema-v1) to CMS 0.2.0 (core-schema-v2)");
		expect(prompt).toContain("Convert legacy `jp` values to `ja`");
		expect(prompt).toContain("/consumer/cms.config.ts");
		expect(prompt).toContain("/consumer/drizzle.config.ts");
		expect(prompt).toContain("@repo/cli/db/schema");
		expect(prompt).toContain("Preserve existing IDs, data, and foreign-key relationships");
		expect(prompt).toContain("Do not apply migrations to any D1 database");
		expect(prompt).toContain("do not update cms-state.json");
	});
});
