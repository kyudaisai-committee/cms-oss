import "server-only";

import { drizzle, type AnyD1Database } from "drizzle-orm/d1";

import { schema } from "#core/db/schema";

export function createDb(database: AnyD1Database) {
	return drizzle(database, { schema });
}

export type Database = ReturnType<typeof createDb>;
