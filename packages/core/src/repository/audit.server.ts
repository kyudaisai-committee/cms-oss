import "server-only";

import { desc, eq } from "drizzle-orm";

import type { Database } from "#core/db.server";
import { auditLogs } from "#core/db/schema";

export class AuditRepository {
	constructor(private readonly database: Database) {}

	async listAuditLogs(scopeId: string, limit = 100) {
		return this.database
			.select()
			.from(auditLogs)
			.where(eq(auditLogs.scopeId, scopeId))
			.orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
			.limit(limit);
	}
}
