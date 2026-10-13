import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CMS_CONFIG_DEFAULTS } from "@repo/config";

import { assertConsumerD1Target } from "./d1-target.js";

const expected = {
	...CMS_CONFIG_DEFAULTS.cloudflare,
	databaseName: "cms-test",
	databaseId: "11111111-1111-4111-8111-111111111111",
};

describe("assertConsumerD1Target", () => {
	it("reads D1 name and id from a consumer JSONC config using Wrangler's config reader", async () => {
		const directory = await mkdtemp(join(tmpdir(), "cms-cli-wrangler-jsonc-"));
		const configPath = join(directory, "wrangler.jsonc");

		try {
			await writeFile(
				configPath,
				JSON.stringify({
					name: "consumer",
					compatibility_date: "2026-10-14",
					d1_databases: [
						{
							binding: "DB",
							database_name: expected.databaseName,
							database_id: expected.databaseId,
						},
					],
				}),
			);

			expect(() => assertConsumerD1Target(configPath, undefined, expected)).not.toThrow();
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("uses the selected Wrangler environment and rejects a name or id mismatch", async () => {
		const directory = await mkdtemp(join(tmpdir(), "cms-cli-wrangler-env-"));
		const configPath = join(directory, "wrangler.jsonc");
		const otherDatabase = {
			binding: "DB",
			database_name: "another-database",
			database_id: "22222222-2222-4222-8222-222222222222",
		};

		try {
			await writeFile(
				configPath,
				JSON.stringify({
					name: "consumer",
					compatibility_date: "2026-10-14",
					d1_databases: [otherDatabase],
					env: {
						staging: {
							name: "consumer-staging",
							compatibility_date: "2026-10-14",
							d1_databases: [
								{
									binding: "DB",
									database_name: expected.databaseName,
									database_id: expected.databaseId,
								},
							],
						},
					},
				}),
			);

			expect(() => assertConsumerD1Target(configPath, "staging", expected)).not.toThrow();
			expect(() => assertConsumerD1Target(configPath, undefined, expected)).toThrow(
				"targets another-database (22222222-2222-4222-8222-222222222222)",
			);
			expect(() =>
				assertConsumerD1Target(configPath, "staging", {
					...expected,
					databaseId: "33333333-3333-4333-8333-333333333333",
				}),
			).toThrow("cms.config.ts expects cms-test (33333333-3333-4333-8333-333333333333)");
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("reads a consumer TOML configuration without rewriting it", async () => {
		const directory = await mkdtemp(join(tmpdir(), "cms-cli-wrangler-toml-"));
		const configPath = join(directory, "wrangler.toml");

		try {
			await writeFile(
				configPath,
				[
					'name = "consumer"',
					'compatibility_date = "2026-10-14"',
					"[[d1_databases]]",
					'binding = "DB"',
					`database_name = "${expected.databaseName}"`,
					`database_id = "${expected.databaseId}"`,
					"",
				].join("\n"),
			);

			expect(() => assertConsumerD1Target(configPath, undefined, expected)).not.toThrow();
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
