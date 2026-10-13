import "server-only";

import { and, asc, desc, eq, isNull } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { Database } from "#core/db.server";
import { news, newsTranslations, scopes } from "#core/db/schema";
import { canonicalizeStoredLanguage } from "#core/input";
import type { AuditEntry, ScopeRef } from "#core/types";

import { createAuditStatement, executeBatch } from "./shared.server";

type ScopeRecord = InferSelectModel<typeof scopes>;

export class ScopeRepository {
	constructor(private readonly database: Database) {}

	async listScopes() {
		return this.database.select().from(scopes).orderBy(desc(scopes.year), asc(scopes.site));
	}

	async findScope(scope: ScopeRef) {
		const [row] = await this.database
			.select()
			.from(scopes)
			.where(and(eq(scopes.year, scope.year), eq(scopes.site, scope.site)))
			.limit(1);
		return row ?? null;
	}

	async findScopeById(id: string) {
		const [row] = await this.database.select().from(scopes).where(eq(scopes.id, id)).limit(1);
		return row ?? null;
	}

	async insertScope(scope: ScopeRecord, audit?: AuditEntry) {
		const statements: BatchItem<"sqlite">[] = [this.database.insert(scopes).values(scope)];
		if (audit) statements.push(createAuditStatement(this.database, audit));
		await executeBatch(this.database, statements);
	}

	async updateScope(id: string, values: Partial<ScopeRecord>, audit?: AuditEntry) {
		const statements: BatchItem<"sqlite">[] = [
			this.database.update(scopes).set(values).where(eq(scopes.id, id)),
		];
		if (audit) statements.push(createAuditStatement(this.database, audit));
		await executeBatch(this.database, statements);
	}

	async countTranslationsByLanguage(scopeId: string, lang: string) {
		const rows = await this.database
			.select({ lang: newsTranslations.lang })
			.from(newsTranslations)
			.innerJoin(news, eq(newsTranslations.newsId, news.id))
			.where(
				and(eq(news.scopeId, scopeId), isNull(news.deletedAt), isNull(newsTranslations.deletedAt)),
			);
		return rows.filter((row) => canonicalizeStoredLanguage(row.lang) === lang).length;
	}
}
