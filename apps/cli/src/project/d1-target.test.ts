import { mkdtempDisposable, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { validateConfig } from "@repo/config";

import { assertConsumerD1Target } from "./d1-target.js";

const nativeDatabase = {
	binding: "DB",
	database_name: "consumer-db",
	database_id: "11111111-1111-4111-8111-111111111111",
};

describe("assertConsumerD1Target", () => {
	it("reads the selected D1 target and migrations table using Wrangler's config reader", async () => {
		await using temporaryDirectory = await mkdtempDisposable(
			join(tmpdir(), "cms-cli-wrangler-jsonc-"),
		);
		const configPath = join(temporaryDirectory.path, "wrangler.jsonc");
		const cloudflare = validateConfig({
			cloudflare: {
				name: "consumer",
				d1_databases: [nativeDatabase],
			},
		}).cloudflare;
		await writeFile(
			configPath,
			JSON.stringify({
				name: "consumer",
				compatibility_date: "2026-10-14",
				d1_databases: [
					{ ...nativeDatabase, migrations_dir: "./drizzle", migrations_table: "cms_history" },
				],
			}),
		);

		expect(
			assertConsumerD1Target(
				configPath,
				undefined,
				cloudflare,
				join(temporaryDirectory.path, "drizzle"),
			),
		).toEqual({
			databaseName: "consumer-db",
			databaseId: nativeDatabase.database_id,
			migrationsDirectory: join(temporaryDirectory.path, "drizzle"),
			migrationsTableName: "cms_history",
		});
	});

	it("uses the selected Wrangler env and rejects direct DB, path, or history mismatches", async () => {
		await using temporaryDirectory = await mkdtempDisposable(
			join(tmpdir(), "cms-cli-wrangler-env-"),
		);
		const configPath = join(temporaryDirectory.path, "wrangler.jsonc");
		const otherDatabase = {
			binding: "DB",
			database_name: "another-database",
			database_id: "22222222-2222-4222-8222-222222222222",
		};
		const cloudflare = validateConfig({
			cloudflare: { name: "consumer", d1_databases: [nativeDatabase] },
		}).cloudflare;
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
						d1_databases: [{ ...nativeDatabase, migrations_dir: "./drizzle" }],
					},
				},
			}),
		);

		expect(
			assertConsumerD1Target(
				configPath,
				"staging",
				cloudflare,
				join(temporaryDirectory.path, "drizzle"),
			),
		).toMatchObject({ databaseName: nativeDatabase.database_name });
		const varsOnlyConfig = validateConfig({
			cloudflare: { vars: { ACCESS_AUDIENCE: "selected-worker-audience" } },
		}).cloudflare;
		expect(
			assertConsumerD1Target(
				configPath,
				"staging",
				varsOnlyConfig,
				join(temporaryDirectory.path, "drizzle"),
			),
		).toMatchObject({ databaseName: nativeDatabase.database_name });
		expect(() =>
			assertConsumerD1Target(
				configPath,
				undefined,
				cloudflare,
				join(temporaryDirectory.path, "drizzle"),
			),
		).toThrow("targets another-database");
		expect(() =>
			assertConsumerD1Target(
				configPath,
				"staging",
				validateConfig({
					cloudflare: {
						name: "consumer",
						d1_databases: [
							{
								...nativeDatabase,
								database_id: "33333333-3333-4333-8333-333333333333",
							},
						],
					},
				}).cloudflare,
				join(temporaryDirectory.path, "drizzle"),
			),
		).toThrow("direct Cloudflare configuration expects");
		expect(() =>
			assertConsumerD1Target(
				configPath,
				"missing",
				cloudflare,
				join(temporaryDirectory.path, "drizzle"),
			),
		).toThrow('Cloudflare environment "missing" is not defined');
		const directBindingsWithoutDb = validateConfig({
			cloudflare: {
				name: "consumer",
				d1_databases: [{ binding: "OTHER_DB", database_name: "other-db", database_id: "other-id" }],
			},
		}).cloudflare;
		expect(() =>
			assertConsumerD1Target(
				configPath,
				"staging",
				directBindingsWithoutDb,
				join(temporaryDirectory.path, "drizzle"),
			),
		).toThrow("must include a DB D1 binding");

		const matchingDirectPath = validateConfig({
			cloudflare: {
				name: "consumer",
				d1_databases: [
					{ ...nativeDatabase, migrations_dir: "./drizzle", migrations_table: "d1_migrations" },
				],
			},
		}).cloudflare;
		expect(
			assertConsumerD1Target(
				configPath,
				"staging",
				matchingDirectPath,
				join(temporaryDirectory.path, "drizzle"),
				temporaryDirectory.path,
			),
		).toMatchObject({ databaseName: nativeDatabase.database_name });
		expect(() =>
			assertConsumerD1Target(
				configPath,
				"staging",
				matchingDirectPath,
				join(temporaryDirectory.path, "drizzle"),
				join(temporaryDirectory.path, ".cms"),
			),
		).toThrow("resolves it to");

		const mismatchedTable = validateConfig({
			cloudflare: {
				name: "consumer",
				d1_databases: [{ ...nativeDatabase, migrations_table: "cms_history" }],
			},
		}).cloudflare;
		expect(() =>
			assertConsumerD1Target(
				configPath,
				"staging",
				mismatchedTable,
				join(temporaryDirectory.path, "drizzle"),
			),
		).toThrow("selected Wrangler configuration uses d1_migrations");
	});

	it("allows Wrangler configPath mode to source the D1 binding without duplicate CMS values", async () => {
		await using temporaryDirectory = await mkdtempDisposable(
			join(tmpdir(), "cms-cli-wrangler-reference-target-"),
		);
		const configPath = join(temporaryDirectory.path, "wrangler.toml");
		const cloudflare = validateConfig({
			cloudflare: { configPath: "./wrangler.toml" },
		}).cloudflare;
		await writeFile(
			configPath,
			[
				'name = "consumer"',
				'compatibility_date = "2026-10-14"',
				"[[d1_databases]]",
				'binding = "DB"',
				`database_name = "${nativeDatabase.database_name}"`,
				`database_id = "${nativeDatabase.database_id}"`,
				'migrations_dir = "./drizzle"',
				'migrations_table = "cms_migrations"',
				"",
			].join("\n"),
		);

		expect(
			assertConsumerD1Target(
				configPath,
				undefined,
				cloudflare,
				join(temporaryDirectory.path, "drizzle"),
			),
		).toMatchObject({ migrationsTableName: "cms_migrations" });
	});
});
