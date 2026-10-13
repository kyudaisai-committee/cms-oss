import { DatabaseSync } from "node:sqlite";

import { generateSQLiteDrizzleJson, generateSQLiteMigration } from "drizzle-kit/api";

import { schema } from "#core/db/schema";

const currentSchema = await generateSQLiteDrizzleJson(schema);
const emptySchema = await generateSQLiteDrizzleJson({});
const initialSchemaSql = (await generateSQLiteMigration(emptySchema, currentSchema)).join("\n");

export function createTestDatabase(): DatabaseSync {
	const database = new DatabaseSync(":memory:");
	database.exec(initialSchemaSql);
	return database;
}
