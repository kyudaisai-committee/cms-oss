import "server-only";

import type { SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { SQLiteAsyncDialect } from "drizzle-orm/sqlite-core";

import type { Database } from "#core/db.server";
import { auditLogs } from "#core/db/schema";
import type { AuditEntry } from "#core/types";

export async function executeBatch(database: Database, statements: BatchItem<"sqlite">[]) {
	if (statements.length === 0) return [];
	return database.batch(
		statements as unknown as readonly [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
	);
}

export async function executeRawSqlBatch(database: Database, statements: SQL[]) {
	if (statements.length === 0) return [];
	const dialect = new SQLiteAsyncDialect();
	const prepared = statements.map((statement) => {
		const query = dialect.sqlToQuery(statement);
		return database.$client.prepare(query.sql).bind(...query.params);
	});
	return database.$client.batch(prepared);
}

export function createAuditStatement(database: Database, entry: AuditEntry) {
	return database.insert(auditLogs).values({
		id: crypto.randomUUID(),
		scopeId: entry.scopeId ?? null,
		actorType: entry.actor.type,
		actorId: entry.actor.id,
		actorEmail: entry.actor.email,
		actorLabel: entry.actor.label,
		action: entry.action,
		entityType: entry.entityType,
		entityId: entry.entityId,
		changes: entry.changes,
		createdAt: entry.createdAt,
	});
}
