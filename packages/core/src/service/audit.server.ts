import "server-only";

import type { InferSelectModel } from "drizzle-orm";

import { scopes } from "#core/db/schema";
import { toAuditDto } from "#core/dto";
import { CmsRepository } from "#core/repository.server";
import type { AuditDto } from "#core/types";

type ScopeRecord = InferSelectModel<typeof scopes>;

export class AuditService {
	constructor(
		private readonly repository: CmsRepository,
		private readonly scope: ScopeRecord,
	) {}

	async listAuditLogs(): Promise<AuditDto[]> {
		return (await this.repository.listAuditLogs(this.scope.id)).map(toAuditDto);
	}
}
