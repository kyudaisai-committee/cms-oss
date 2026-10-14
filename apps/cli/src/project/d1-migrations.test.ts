import { mkdtempDisposable, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { validateConfig } from "@repo/config";

import {
	createD1MigrationArguments,
	createD1MigrationHistoryArguments,
	parseD1MigrationHistory,
	resolveD1MigrationContext,
} from "./d1-migrations.js";
import { resolveProjectPaths } from "./paths.js";

describe("D1 migration command arguments", () => {
	it("pins the consumer config, selected environment, and local Worker persistence", () => {
		const context = {
			wranglerConfigPath: "/consumer/wrangler.jsonc",
			drizzleOutputDirectory: "/consumer/drizzle",
			databaseName: "cms-staging",
			databaseId: "11111111-1111-4111-8111-111111111111",
			migrationsTableName: "d1_migrations",
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
			migrationsTableName: "d1_migrations",
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

	it("checks the selected database history table through Wrangler JSON output", () => {
		const context = {
			wranglerConfigPath: "/consumer/wrangler.jsonc",
			drizzleOutputDirectory: "/consumer/migrations",
			databaseName: "cms-staging",
			databaseId: "11111111-1111-4111-8111-111111111111",
			migrationsTableName: "cms_history",
			environmentName: "staging",
			location: "local" as const,
			persistTo: "/consumer/.wrangler/state",
		};

		expect(createD1MigrationHistoryArguments(context, "0000_cms-initial.sql")).toEqual([
			"wrangler",
			"d1",
			"execute",
			"cms-staging",
			"--config",
			"/consumer/wrangler.jsonc",
			"--command",
			`SELECT "name" FROM "cms_history" WHERE "name" = '0000_cms-initial.sql';`,
			"--json",
			"--env",
			"staging",
			"--local",
			"--persist-to",
			"/consumer/.wrangler/state",
		]);
	});
});

describe("Wrangler D1 migration history response", () => {
	it("reads applied names and recognizes empty history", () => {
		expect(
			parseD1MigrationHistory(
				JSON.stringify([{ results: [{ name: "0000_cms-initial.sql" }], success: true }]),
			),
		).toEqual(["0000_cms-initial.sql"]);
		expect(parseD1MigrationHistory(JSON.stringify([{ results: [], success: true }]))).toEqual([]);
	});

	it("rejects invalid or failed history responses instead of treating them as applied", () => {
		expect(() => parseD1MigrationHistory("not-json")).toThrow("invalid JSON");
		expect(() =>
			parseD1MigrationHistory(JSON.stringify([{ results: [], success: false }])),
		).toThrow("could not verify");
		expect(() =>
			parseD1MigrationHistory(JSON.stringify([{ results: [{}], success: true }])),
		).toThrow("invalid D1 migration history row");
	});
});

describe("resolveD1MigrationContext", () => {
	it("uses the same Wrangler env for the selected D1 and consumer Drizzle output", async () => {
		await using directory = await mkdtempDisposable(join(tmpdir(), "cms-cli-d1-context-"));
		const paths = resolveProjectPaths(directory.path);
		const wranglerConfigPath = join(directory.path, "wrangler.jsonc");

		await writeFile(
			join(directory.path, "drizzle.config.ts"),
			'export default { out: "./drizzle" };\n',
		);
		await writeFile(
			wranglerConfigPath,
			JSON.stringify({
				name: "consumer",
				compatibility_date: "2026-10-14",
				env: {
					staging: {
						name: "consumer-staging",
						d1_databases: [
							{
								binding: "DB",
								database_name: "cms-staging",
								database_id: "11111111-1111-4111-8111-111111111111",
								migrations_dir: "./drizzle",
							},
						],
					},
				},
			}),
		);
		const cmsConfig = validateConfig({
			cloudflare: { configPath: "./wrangler.jsonc" },
		});
		const context = await resolveD1MigrationContext(
			paths,
			{
				config: cmsConfig,
				configDirectory: directory.path,
				cloudflare: cmsConfig.cloudflare,
				environmentName: "staging",
				wranglerConfigPath: undefined,
			},
			undefined,
			"local",
		);

		expect(context).toEqual({
			wranglerConfigPath,
			drizzleOutputDirectory: join(directory.path, "drizzle"),
			databaseName: "cms-staging",
			databaseId: "11111111-1111-4111-8111-111111111111",
			migrationsTableName: "d1_migrations",
			environmentName: "staging",
			location: "local",
			persistTo: join(directory.path, ".wrangler", "state"),
		});
	});
});
