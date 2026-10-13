import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { validateConfig } from "@repo/config";

import { createD1MigrationArguments, resolveD1MigrationContext } from "./d1-migrations.js";
import { resolveProjectPaths } from "./paths.js";

describe("D1 migration command arguments", () => {
	it("pins the consumer config, selected environment, and local Worker persistence", () => {
		const context = {
			wranglerConfigPath: "/consumer/wrangler.jsonc",
			drizzleOutputDirectory: "/consumer/drizzle",
			databaseName: "cms-staging",
			databaseId: "11111111-1111-4111-8111-111111111111",
			environmentName: "staging",
			location: "local" as const,
			persistTo: "/consumer/.wrangler/state",
		};

		expect(createD1MigrationArguments("list", context)).toEqual([
			"wrangler",
			"d1",
			"migrations",
			"list",
			"cms-staging",
			"--config",
			"/consumer/wrangler.jsonc",
			"--env",
			"staging",
			"--local",
			"--persist-to",
			"/consumer/.wrangler/state",
		]);
	});

	it("omits local persistence for an explicitly selected remote target", () => {
		const context = {
			wranglerConfigPath: "/consumer/wrangler.toml",
			drizzleOutputDirectory: "/consumer/drizzle",
			databaseName: "cms-prod",
			databaseId: "11111111-1111-4111-8111-111111111111",
			environmentName: undefined,
			location: "remote" as const,
			persistTo: undefined,
		};

		expect(createD1MigrationArguments("apply", context)).toEqual([
			"wrangler",
			"d1",
			"migrations",
			"apply",
			"cms-prod",
			"--config",
			"/consumer/wrangler.toml",
			"--remote",
		]);
	});
});

describe("resolveD1MigrationContext", () => {
	it("requires the selected consumer Wrangler DB and Drizzle directories to match cms.config", async () => {
		const directory = await mkdtemp(join(tmpdir(), "cms-cli-d1-context-"));
		const paths = resolveProjectPaths(directory);
		const wranglerConfigPath = join(directory, "wrangler.jsonc");

		try {
			await writeFile(
				join(directory, "drizzle.config.ts"),
				'export default { out: "./drizzle" };\n',
			);
			await writeFile(
				wranglerConfigPath,
				JSON.stringify({
					name: "consumer",
					compatibility_date: "2026-10-14",
					d1_databases: [
						{
							binding: "DB",
							database_name: "cms-staging",
							database_id: "11111111-1111-4111-8111-111111111111",
							migrations_dir: "./drizzle",
						},
					],
				}),
			);
			const cmsConfig = validateConfig({
				cloudflare: {
					databaseName: "cms-local",
					databaseId: "22222222-2222-4222-8222-222222222222",
				},
				environments: {
					staging: {
						cloudflare: {
							databaseName: "cms-staging",
							databaseId: "11111111-1111-4111-8111-111111111111",
						},
					},
				},
			});
			const stagingEnvironment = cmsConfig.environments.staging;
			if (!stagingEnvironment) throw new Error("The test staging environment was not created.");
			const context = await resolveD1MigrationContext(
				paths,
				{
					config: cmsConfig,
					configDirectory: directory,
					cloudflare: stagingEnvironment.cloudflare,
					environmentName: "staging",
				},
				undefined,
				"local",
			);

			expect(context).toEqual({
				wranglerConfigPath,
				drizzleOutputDirectory: join(directory, "drizzle"),
				databaseName: "cms-staging",
				databaseId: "11111111-1111-4111-8111-111111111111",
				environmentName: "staging",
				location: "local",
				persistTo: join(directory, ".wrangler", "state"),
			});
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
